#!/usr/bin/python
import sys
import os.path
import os
import mapreduce
import histogram_tools
try:
    from java.util import Date
    jython = True
except ImportError:
    from datetime import datetime
    jython = False

f = sys.stdin

class Context:
    def __init__(self):
        self.values = {}
        
    def write(self, key, value):
        ls = self.values.get(key, None)
        if ls == None:
            ls = []
            self.values[key] = ls
        ls.append(value)
    
    def iteritems(self):
        return self.values.iteritems()

    def summarize(self):
        print "%d values produced" % len(self.values)


class OutContext:
    def __init__(self):
        self.out = open(sys.argv[1], 'w')
        
    def write(self, key, value):
        self.out.write("%s\t%s\n" % (key, value))
    
context = Context()

bytes_read = 0

now = Date if jython else datetime.now

def time_delta(old):
    if jython:
        ms = (Date().getTime() - old.getTime())
    else:
        delta = (datetime.now() - old)
        ms = delta.seconds * 1000 + delta.microseconds/1000
    return ms
start = now()

while True:
    line = f.readline()
    l = len(line)
    if l <= 1:
        if l == 0:
            break;
        else:
            continue
    bytes_read += l
    mapreduce.map(bytes_read, line, context)

ms = time_delta(start)

context.summarize()
print  "read %s MB/s %d bytes in %s seconds" % (str(1000*bytes_read/1024/1024/ms), bytes_read, ms/1000)

start = now()
reduce_context = OutContext()
for key, values in context.iteritems():
    mapreduce.reduce(key, values, reduce_context)

print "reduce in %d ms" % time_delta(start)
