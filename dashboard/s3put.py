from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
import sys, os, gzip
from StringIO import StringIO
from utils import mkdirp
from multiprocessing import Process, Queue, cpu_count
from boto.s3 import connect_to_region as s3_connect
from boto.s3.key import Key
from traceback import print_exc
import shutil

class Uploader(Process):
    def __init__(self, queue, target_bucket, decompress, compress, region, aws_cred):
        super(Uploader, self).__init__()
        self.queue = queue
        self.target_bucket = target_bucket
        self.decompress = decompress
        self.compress = compress
        self.region = region
        self.aws_cred = aws_cred

    def run(self):
        if self.decompress:
            def read(path):
                return gzip.open(path, 'r')
        else:
            def read(path):
                return open(path, 'r')
        s3 = s3_connect(self.region, **self.aws_cred)
        bucket = s3.get_bucket(self.target_bucket, validate = False)
        while True:
            msg = self.queue.get()
            if msg == None:
                break
            source_file, target_prefix = msg
            retries = 0
            while retries < 3:
                try:
                    retries += 1
                    with read(source_file) as f:
                        data = f.read()
                    headers = {
                        'Content-Type':     'application/json'
                    }
                    if self.compress:
                        fobj = StringIO()
                        with gzip.GzipFile(mode = 'wb', fileobj = fobj) as zobj:
                            zobj.write(data)
                        data = fobj.getvalue()
                        fobj.close()
                        headers['Content-Encoding'] = 'gzip'
                    # Put to S3
                    k = Key(bucket)
                    k.key = target_prefix
                    k.set_contents_from_string(data, headers = headers)
                    break
                except:
                    print >> sys.stderr, "Failed to upload %s to %s" % msg
                    print_exc(file = sys.stderr)
            if retries >= 3:
                sys.exit(1)
        s3.close()

def s3put(input_folder, target_bucket, prefix, decompress, compress, region,
          aws_cred, nb_workers = cpu_count() * 4):
    if prefix != "" and not prefix.endswith('/'):
        prefix += '/'

    # Create queue of work to do
    queue = Queue()

    # Start workers
    uploaders = []
    for i in xrange(0, nb_workers):
        uploader = Uploader(queue, target_bucket, decompress, compress, region, aws_cred)
        uploaders.append(uploader)
        uploader.start()

    # Walk input_folder
    for path, folder, files in os.walk(input_folder):
        for f in files:
            source_file = os.path.join(path, f)
            relpath = os.path.relpath(source_file, input_folder)
            queue.put((source_file, prefix + relpath))

    # Add end of queue marker for each worker
    for i in xrange(0, nb_workers):
        queue.put(None)

    # Join workers
    for uploader in uploaders:
        uploader.join()

    # If one of the uploaders failed, we've failed
    for uploader in uploaders:
        if uploader.exitcode != 0:
            return False

    return True

def main():
    p = ArgumentParser(
        description = 'Clone folder tree to s3 while decompressing and/or compressing files',
        formatter_class = ArgumentDefaultsHelpFormatter
    )
    p.add_argument(
        "-i", "--input-folder",
        help = "Input folder to clone to s3",
        required = True
    )
    p.add_argument(
        "-o", "--target-bucket",
        help = "Bucket to upload files to",
        required = True
    )
    p.add_argument(
        "-p", "--prefix",
        help = "Prefix in target bucket",
        required = False
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
    retval = s3put(cfg.input_folder, cfg.target_bucket, cfg.prefix, cfg.gunzip,
                   cfg.gzip, cfg.region, aws_cred, nb_workers)
    if retval:
        print "Successfully uploaded all"
    else:
        print "Failed to upload some"


if __name__ == "__main__":
    sys.exit(main())