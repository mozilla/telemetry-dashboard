from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
import sys, os, gzip
from utils import mkdirp
import shutil

def gzipclone(source_folder, target_folder, decompress, compress):
    shutil.rmtree(target_folder, ignore_errors = True)
    if decompress:
        def read(path):
            return gzip.open(path, 'r')
    else:
        def read(path):
            return open(path, 'r')
    if compress:
        def write(path):
            return gzip.open(path, 'w')
    else:
        def write(path):
            return open(path, 'w')
    # Walk source_folder
    for path, folder, files in os.walk(source_folder):
        for f in files:
            source_file = os.path.join(path, f)
            relpath = os.path.relpath(source_file, source_folder)
            target_file = os.path.join(target_folder, relpath)
            mkdirp(os.path.dirname(target_file))
            with read(source_file) as i:
                with write(target_file) as o:
                    shutil.copyfileobj(i, o)

def main():
    p = ArgumentParser(
        description = 'Clone folder tree while decompressing and/or compressing files',
        formatter_class = ArgumentDefaultsHelpFormatter
    )
    p.add_argument(
        "-i", "--input-folder",
        help = "Input folder to clone into output folder",
        required = True
    )
    p.add_argument(
        "-o", "--output-folder",
        help = "Output folder to clone data into",
        required = True
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
    cfg = p.parse_args()
    gzipclone(cfg.input_folder, cfg.output_folder, cfg.gunzip, cfg.gzip)


if __name__ == "__main__":
    sys.exit(main())