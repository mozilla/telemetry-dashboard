#!/usr/bin/env python

from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
from boto.sqs import connect_to_region as sqs_connect
from boto.s3.connection import S3Connection
from boto.sqs.jsonmessage import JSONMessage
from time import sleep
import os, sys

def upload_folder(data_folder, target_bucket):
    os.system("aws s3 cp --recursive %s %s/" % (data_folder, target_bucket))

def process_message(msg, data_folder, bucket):
    source_prefix = "output/" + msg["id"] + "/result.txt"
    k = bucket.get_key(source_prefix)
    k.get_contents_to_filename("result.txt")
    os.system("python mr2disk.py %s < result.txt" % data_folder)

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
        "-d", "--data-folder",
        help = "Folder for data-files",
        required = True
    )
    p.add_argument(
        "-t", "--target-bucket",
        help = "Bucket to upload the data-files to",
        required = True
    )
    cfg = p.parse_args()

    aws_cred = {
        'aws_access_key_id':        cfg.aws_key,
        'aws_secret_access_key':    cfg.aws_secret_key
    }

    s3 = S3Connection(**aws_cred)
    sqs = sqs_connect("us-west-2", **aws_cred)

    bucket = s3.get_bucket("jonasfj-telemetry-analysis")

    input_queue = sqs.get_queue(cfg.input_queue)
    input_queue.set_message_class(JSONMessage)

    changed = False
    while True:
        msgs = input_queue.get_messages(num_messages = 2)
        if len(msgs) > 0:
            for msg in msgs:
                process_message(msg, cfg.data_folder, bucket)
            input_queue.delete_message_batch(msgs)
            changed = True
        else:
            if changed:
                upload_folder(cfg.data_folder, cfg.target_bucket)
                changed = False
            else:
                sleep(120)

if __name__ == "__main__":
    sys.exit(main())