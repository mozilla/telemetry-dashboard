#!/usr/bin/env python

from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
from boto.sqs import connect_to_region as sqs_connect
from boto.s3 import connect_to_region as s3_connect
from boto.s3.key import Key
from boto.sqs.jsonmessage import JSONMessage
from multiprocessing import Queue, cpu_count
from time import sleep
import os, sys, shutil, gzip
import json
from cStringIO import StringIO
from datetime import datetime

from utils import mkdirp
from results2disk import results2disk
from s3put import s3put
from s3get import s3get, Downloader
from mergeresults import ResultContext, ResultMergingProcess

class Aggregator:
    def __init__(self, input_queue, work_folder, bucket, prefix, region, aws_cred):
        self.input_queue_name       = input_queue
        self.work_folder            = work_folder
        self.data_folder            = os.path.join(work_folder, 'data')
        self.bucket_name            = bucket
        self.prefix                 = prefix
        self.region                 = region
        self.aws_cred               = aws_cred
        self.analysis_bucket_name   = "jonasfj-telemetry-analysis"
        if self.prefix != '' and not self.prefix.endswith('/'):
            self.prefix += '/'
        # Clear the work folder
        shutil.rmtree(self.work_folder, ignore_errors = True)
        mkdirp(self.data_folder)
        self.s3 = s3_connect(self.region, **self.aws_cred)
        self.bucket = self.s3.get_bucket(self.bucket_name, validate = False)
        self.analysis_bucket = self.s3.get_bucket(self.analysis_bucket_name,
                                                  validate = False)

    def s3get_json(self, prefix, decompress, fallback_value = None):
        k = self.bucket.get_key(self.prefix + prefix)
        if k is None:
            return fallback_value
        data = k.get_contents_as_string()
        if decompress:
            fobj = StringIO(data)
            with gzip.GzipFile(mode = 'rb', fileobj = fobj) as zobj:
                data = zobj.read()
            fobj.close()
        return json.loads(data)

    def s3put_json(self, prefix, compress, value):
        k = Key(self.bucket)
        k.key = self.prefix + prefix
        data = json.dumps(value)
        headers = {
            'Content-Type':     'application/json'
        }
        if compress:
            fobj = StringIO()
            with gzip.GzipFile(mode = 'wb', fileobj = fobj) as zobj:
                zobj.write(data)
            data = fobj.getvalue()
            fobj.close()
            headers['Content-Encoding'] = 'gzip'
        k.set_contents_from_string(data, headers = headers)

    def download_latest(self):
        # Get latest-current.json
        latest_current = self.s3get_json('latest-current.json', True)
        # Get checkpoints.json
        self.checkpoints = self.s3get_json('check-points.json', True, [])
        # Get files to work folder
        if latest_current != None:
            current_prefix = self.prefix + "current/" + latest_current['current']
            retval = s3get(self.bucket_name, current_prefix, self.data_folder,
                           True, False, self.region, self.aws_cred)
            if not retval:
                raise Error("Failed to download latest current version")

    def process_message(self, msg):
        """ Process a message """
        if msg['target-prefix'] is None:
            # If target-prefix is None, then the message failed... we add the
            # input files to list of missing files
            files_missing_path = os.path.join(self.data_folder, 'FILES_MISSING')
            with open(files_missing_path, 'a+') as files_missing:
                for f in msg['files']:
                    files_missing.write(f + "\n")
        else:
            # If we have a target-prefix, we fetch results.txt
            results_path = os.path.join(self.work_folder, 'result.txt')
            k = self.analysis_bucket.get_key(msg['target-prefix'] + 'result.txt')
            k.get_contents_to_filename(results_path)
            # Now put results to disk
            results2disk(results_path, self.data_folder, False, False)
            # Upload FILES_PROCESSED
            files_processed_path = os.path.join(self.data_folder, 'FILES_PROCESSED')
            with open(files_processed_path, 'a+') as files_processed:
                for f in msg['files']:
                    files_processed.write(f + "\n")
        print "Processed message: %s" % msg['id']

    def create_checkpoint(self):
        # Find date
        date = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        # s3put data_folder to checkpoint folder
        checkpoint_prefix = self.prefix + "check-points/%s/" % date
        s3put(self.data_folder, self.bucket_name, checkpoint_prefix, False,
              True, self.region, self.aws_cred)
        # Update and upload checkpoints
        self.checkpoints.append(date)
        self.s3put_json('check-points.json', True, self.checkpoints)

    def days_since_last_checkpoint(self):
        last_checkpoint = datetime(1, 1, 1, 0, 0)
        for checkpoint in self.checkpoints:
            cp = datetime.strptime(checkpoint, "%Y%m%d%H%M%S")
            if last_checkpoint < cp:
                last_checkpoint = cp
        return (datetime.utcnow() - last_checkpoint).days

    def publish_results(self):
        print "Uploading Results"
        # s3put compressed to current/...
        date = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        current_prefix = self.prefix + 'current/%s/' % date
        s3put(self.data_folder, self.bucket_name, current_prefix, False, True,
              self.region, self.aws_cred)
        # update latest-current.json
        with open(os.path.join(self.data_folder, 'versions.json'), 'r') as f:
            versions = json.load(f)
        self.s3put_json('latest-current.json', True, {
            'current':      date,
            'versions':     versions
        })
        print "Published results at %s" % current_prefix

    def process_queue(self):
        # connect to sqs
        sqs = sqs_connect(self.region, **self.aws_cred)
        queue = sqs.get_queue(self.input_queue_name)
        queue.set_message_class(JSONMessage)
        # messages processed since last flush
        processed_msgblocks = []
        last_flush = datetime.utcnow()
        while True:
            # get new_messages from sqs
            messages = []
            for i in xrange(0, 2):
                msgs = queue.get_messages(num_messages = 10)
                messages += msgs
                if len(msgs) > 0:
                    processed_msgblocks.append(msgs)
                else:
                    break
            print "Fetched %i messages" % len(messages)
            # process msgs
            self.process_messages_merging(messages)
            if len(messages) == 0:
                sleep(120)
            # Publish if necessary
            if (datetime.utcnow() - last_flush).seconds > 60 * 55:
                last_flush = datetime.utcnow()
                # Skip publishing if there are no new results
                if len(processed_msgblocks) == 0:
                    continue
                self.publish_results()
                # delete messages
                for block in processed_msgblocks:
                    queue.delete_message_batch(block)
                processed_msgblocks = []
                # check point if necessary
                if self.days_since_last_checkpoint() >= 7:
                    self.create_checkpoint()

    def aggregate(self):
        # Download latest results
        self.download_latest()
        # Process queue while publishing results and making check points
        self.process_queue()

    def process_messages(self, msgs):
        # Find results to download
        results = []
        for msg in msgs:
            if msg['target-prefix'] != None:
                results.append(msg['target-prefix'] + 'result.txt')

        # Download results
        if len(results) > 0:
            target_paths = []
            download_queue = Queue()
            result_queue = Queue()
            # Make a job queue
            i = 0
            for result in results:
                i += 1
                result_path = os.path.join(self.work_folder, "result-%i.txt" % i)
                download_queue.put((result, result_path))
                target_paths.append(result_path)

            # Start downloaders
            downloaders = []
            for i in xrange(0, 2):
                downloader = Downloader(download_queue, result_queue,
                                        self.analysis_bucket_name, False, False,
                                        self.region, self.aws_cred)
                downloaders.append(downloader)
                downloader.start()
                download_queue.put(None)

            # Wait and process results as they are downloaded
            while len(target_paths) > 0:
                result_path = result_queue.get(timeout = 20 * 60)
                results2disk(result_path, self.data_folder, False, False)
                print " - Processed results"
                os.remove(result_path)
                target_paths.remove(result_path)

            # Check that downloaders downloaded correctly
            for downloader in downloaders:
                downloader.join()
                if downloader.exitcode != 0:
                    sys.exit(1)

        # Update FILES_PROCESSED and FILES_MISSING
        for msg in msgs:
            # If there's no target-prefix the message failed
            if msg['target-prefix'] is None:
                # If target-prefix is None, then the message failed... we add the
                # input files to list of missing files
                files_missing_path = os.path.join(self.data_folder, 'FILES_MISSING')
                with open(files_missing_path, 'a+') as files_missing:
                    for f in msg['files']:
                        files_missing.write(f + "\n")
            else:
                # Update FILES_PROCESSED
                files_processed_path = os.path.join(self.data_folder, 'FILES_PROCESSED')
                with open(files_processed_path, 'a+') as files_processed:
                    for f in msg['files']:
                        files_processed.write(f + "\n")

    def process_messages_merging(self, msgs):
        # Find results to download
        results = []
        for msg in msgs:
            if msg['target-prefix'] != None:
                results.append(msg['target-prefix'] + 'result.txt')

        # Download results
        if len(results) > 0:
            target_paths = []
            download_queue = Queue()
            result_queue = Queue()
            # Make a job queue
            i = 0
            for result in results:
                i += 1
                result_path = os.path.join(self.work_folder, "result-%i.txt" % i)
                download_queue.put((result, result_path))
                target_paths.append(result_path)

            # Start downloaders
            downloaders = []
            for i in xrange(0, 4):
                downloader = Downloader(download_queue, result_queue,
                                        self.analysis_bucket_name, False, False,
                                        self.region, self.aws_cred)
                downloaders.append(downloader)
                downloader.start()
                download_queue.put(None)

            # Wait and process results as they are downloaded
            result_merged_path = os.path.join(self.work_folder, "result-merged.txt")
            worker = ResultMergingProcess(result_queue, target_paths, result_merged_path)
            worker.start()
            #ctx = ResultContext()
            #while len(target_paths) > 0:
            #    result_path = result_queue.get(timeout = 20 * 60)
            #    ctx.merge_result_file(result_path)
            #    os.remove(result_path)
            #    target_paths.remove(result_path)
            #    print " - Merged result, % i left" % len(target_paths)

            # Check that downloaders downloaded correctly
            for downloader in downloaders:
                downloader.join()
                if downloader.exitcode != 0:
                    sys.exit(1)

            worker.join()
            if worker.exitcode != 0:
                    sys.exit(1)

            results2disk(result_merged_path, self.data_folder, False, False)
            print " - Processed results"


        # Update FILES_PROCESSED and FILES_MISSING
        for msg in msgs:
            # If there's no target-prefix the message failed
            if msg['target-prefix'] is None:
                # If target-prefix is None, then the message failed... we add the
                # input files to list of missing files
                files_missing_path = os.path.join(self.data_folder, 'FILES_MISSING')
                with open(files_missing_path, 'a+') as files_missing:
                    for f in msg['files']:
                        files_missing.write(f + "\n")
            else:
                # Update FILES_PROCESSED
                files_processed_path = os.path.join(self.data_folder, 'FILES_PROCESSED')
                with open(files_processed_path, 'a+') as files_processed:
                    for f in msg['files']:
                        files_processed.write(f + "\n")

def main():
    p = ArgumentParser(
        description = 'Aggregated and upload dashboard results',
        formatter_class = ArgumentDefaultsHelpFormatter
    )
    p.add_argument(
        "input_queue",
        help = "Queue with results from analysis jobs"
    )
    p.add_argument(
        "-k", "--aws-key",
        help = "AWS Key"
    )
    p.add_argument(
        "-s", "--aws-secret-key",
        help = "AWS Secret Key"
    )
    p.add_argument(
        "-w", "--work-folder",
        help = "Folder to store temporary data in",
        required = True
    )
    p.add_argument(
        "-b", "--bucket",
        help = "Bucket to update with data-files",
        required = True
    )
    p.add_argument(
        "-p", "--prefix",
        help = "Prefix in bucket",
        required = False
    )
    p.add_argument(
        "-r", "--region",
        help = "AWS region to connect to",
        default = 'us-west-2'
    )
    cfg = p.parse_args()

    aws_cred = {
        'aws_access_key_id':        cfg.aws_key,
        'aws_secret_access_key':    cfg.aws_secret_key
    }

    aggregator = Aggregator(cfg.input_queue, cfg.work_folder, cfg.bucket,
                            cfg.prefix, cfg.region, aws_cred)
    aggregator.aggregate()


if __name__ == "__main__":
    sys.exit(main())