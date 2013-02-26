"""
Usage ./import.py telemetry_dump outdir/

Will produce outdir/histograms.txt, outdir/filter.json, outdir/<HISOTGRAM_NAME>.json

TODO: 

* switch from json to a binary encoding
* histograms.json should be replaced/enhanced with db schema reported by client
* include stddev, percentiles, etc where possible
"""
#!/usr/bin/python
import sys
import json

f = open(sys.argv[1])
prefix = "	{"
lineno = 0
"""

Schema: id specifying common filter values looks up list of build dates which contain

"""
root = {'_id':0, 'name':'reason'}
key = ['reason', 'channel', 'appName', 'appVersion', 'OS', 'osVersion', 'arch']
idcount = 1

# schema: histogram_name {build_id:{filter_id:histogram_values},...}
histogram_data = {}

def getId(*tree_args):
    global idcount
    atm = root
    i = 0
    for pvalue in tree_args:
        i = i + 1
        try:
            atm = atm[pvalue]
        except KeyError:
            tmp = {'_id':idcount}
            if i < len(key):
                tmp['name'] = key[i]
            idcount = idcount + 1
            atm[pvalue] = tmp;
            atm = tmp
    return atm


while True:
    oline = f.readline()
    if len(oline) <= 1:
        if len(oline) == 0:
            break;
        else:
            continue

    
    lineno = lineno + 1
    """
    if lineno > 10:
        break
"""
    # strip prefix out
    start = oline.find(prefix) + len(prefix) - 1 ;
    line = oline[start:]
    data = json.loads(line)
    i =  data['info']
    
    channel = i['appUpdateChannel']
    OS = i['OS']
    appName = i['appName']
    reason = i['reason']
    osVersion = i['version']
    appVersion = i['appVersion']
    arch = i['arch']
    buildDate = i['appBuildID'][:8]
    #print [buildDate, channel, arch]
    # todo combine OS + osVersion + santize on crazy platforms like linux to reduce pointless choices
    if OS == "Linux":
        osVersion = osVersion[:3]
    filter_obj = getId(reason, channel, appName, appVersion, OS, osVersion, arch)
    filter_id = filter_obj['_id']

    for h_name, h_values in data['histograms'].iteritems():
        try:
            histogram_forks = histogram_data[h_name]
        except KeyError:
            histogram_forks = {}
            histogram_data[h_name] = histogram_forks
        
        try:
            histograms_by_build = histogram_forks[buildDate]
        except KeyError:
            histograms_by_build = {}
            histogram_forks[buildDate] = histograms_by_build

        try:
            aggr_histogram = histograms_by_build[filter_id]
        except KeyError:
            aggr_histogram = {'values':{}, 'sum':0}
            histograms_by_build[filter_id] = aggr_histogram

        aggr_hgram_values = aggr_histogram['values']
        for bucket, bucket_value in h_values['values'].iteritems():
            try:
                aggr_hgram_values[bucket] += bucket_value
            except KeyError:
                aggr_hgram_values[bucket] = bucket_value
    
        aggr_histogram['sum'] += h_values['sum']

f.close()
outdir = sys.argv[2]

filterfile = open("%s/filter.json" % outdir, 'w')
filterfile.write(json.dumps(root))
filterfile.close()

hgramfile = open("%s/histograms.txt" % outdir, 'w')
hgramfile.write("\n".join(sorted(histogram_data.keys())))
hgramfile.close()

for name, data in histogram_data.iteritems():
    name = "%s/%s.json" % (outdir, name)
    buildfile = open(name, 'w')
    buildfile.write(json.dumps(data))
    buildfile.close()
    print "wrote %s" %name

print "%d lines decoded\n" % lineno
print [idcount]
