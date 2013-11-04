from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
import sys, os, gzip
from cStringIO import StringIO
from utils import mkdirp
from multiprocessing import Process, Queue, cpu_count
from boto.s3 import connect_to_region as s3_connect
from boto.s3.key import Key
from traceback import print_exc
import shutil

class Downloader(Process):
    def __init__(self, queue, output_queue, input_bucket, decompress, compress,
                 region, aws_cred):
        super(Downloader, self).__init__()
        self.queue = queue
        self.output_queue = output_queue
        self.input_bucket = input_bucket
        self.decompress = decompress
        self.compress = compress
        self.region = region
        self.aws_cred = aws_cred

    def run(self):
        if self.compress:
            def write(path):
                return gzip.open(path, 'w')
        else:
            def write(path):
                return open(path, 'w')
        s3 = s3_connect(self.region, **self.aws_cred)
        bucket = s3.get_bucket(self.input_bucket, validate = False)
        while True:
            msg = self.queue.get()
            if msg == None:
                break
            source_prefix, target_path = msg
            retries = 0
            while retries < 3:
                try:
                    retries += 1
                    k = Key(bucket)
                    k.key = source_prefix
                    data = k.get_contents_as_string()
                    if self.decompress:
                        fobj = StringIO(data)
                        with gzip.GzipFile(mode = 'rb', fileobj = fobj) as zobj:
                            data = zobj.read()
                        fobj.close()
                    # Create target folder
                    mkdirp(os.path.dirname(target_path))
                    with write(target_path) as f:
                        f.write(data)
                    break
                except:
                    print >> sys.stderr, "Failed to download %s to %s" % msg
                    print_exc(file = sys.stderr)
            if retries >= 3:
                sys.exit(1)
            if self.output_queue != None:
                self.output_queue.put(target_path)
        s3.close()

def s3get(input_bucket, prefix, output_folder, decompress, compress, region,
          aws_cred, nb_workers = cpu_count() * 4):
    # Clear output folder if necessary
    shutil.rmtree(output_folder, ignore_errors = True)

    # Sanitize prefix, we always work on folders here
    if prefix != "" and not prefix.endswith('/'):
        prefix += '/'

    # Create queue of work to do
    queue = Queue()

    # Start workers
    downloaders = []
    for i in xrange(0, nb_workers):
        downloader = Downloader(queue, None, input_bucket, decompress, compress,
                                region, aws_cred)
        downloaders.append(downloader)
        downloader.start()

    s3 = s3_connect(region, **aws_cred)
    bucket = s3.get_bucket(input_bucket, validate = False)
    for k in bucket.list(prefix = prefix):
        source_prefix = k.key
        rel_prefix = source_prefix[len(prefix):]
        target_path = os.path.join(output_folder, *rel_prefix.split('/'))
        queue.put((source_prefix, target_path))

    # Add end of queue marker for each worker
    for i in xrange(0, nb_workers):
        queue.put(None)

    # Join workers
    for downloader in downloaders:
        downloader.join()

    # If one of the worker failed, we've failed
    for downloader in downloaders:
        if downloader.exitcode != 0:
            return False

    return True

def main():
    p = ArgumentParser(
        description = 'Clone folder tree from s3 while decompressing and/or compressing files',
        formatter_class = ArgumentDefaultsHelpFormatter
    )
    p.add_argument(
        "-i", "--input-bucket",
        help = "Input bucket to clone from s3",
        required = True
    )
    p.add_argument(
        "-p", "--prefix",
        help = "Prefix in input bucket",
        required = False
    )
    p.add_argument(
        "-o", "--output-folder",
        help = "Folder to download files to",
        required = True
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
        "-z", "--gzip",
        help = "gzip compressed output",
        action = 'store_true'
    )
    p.add_argument(
        "-d", "--gunzip",
        help = "decompress input tree",
        action = 'store_true'
    )
    p.add_argument(
        "-r", "--region",
        help = "AWS region to connect to",
        default = 'us-west-2'
    )
    p.add_argument(
        "-j", "--nb-workers",
        help = "Number of parallel workers",
        default = "4 x cpu-count"
    )
    cfg = p.parse_args()

    nb_workers = None
    try:
        nb_workers = int(cfg.nb_workers)
    except ValueError:
        nb_workers = cpu_count() * 4

    cfg = p.parse_args()
    aws_cred = {
        'aws_access_key_id':        cfg.aws_key,
        'aws_secret_access_key':    cfg.aws_secret_key
    }
    retval = s3get(cfg.input_bucket, cfg.prefix, cfg.output_folder, cfg.gunzip,
                   cfg.gzip, cfg.region, aws_cred, nb_workers)
    if retval:
        print "Successfully downloaded all"
    else:
        print "Failed download some"


if __name__ == "__main__":
    sys.exit(main())