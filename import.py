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

# schema: filterid:{buildid:, histogram:value,...}
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
    filter_obj = getId(reason, channel, appName, appVersion, OS, osVersion, arch, buildDate)
    filter_id = filter_obj['_id']
    try:
        builds = histogram_data[filter_id]
    except KeyError:
        builds = {}
        histogram_data[filter_id] = builds

    try:
        build = builds[buildDate]
    except KeyError:
        build = {}
        builds[buildDate] = build
        try:
            filter_obj['builds'].append(buildDate)
        except KeyError:
            filter_obj['builds'] = [buildDate]

    for h_name, h_values in data['histograms'].iteritems():
        try:
            build_hgram = build[h_name]
        except KeyError:
            build_hgram = {'sum':0, 'values':{}}
            build[h_name] = build_hgram

        build_hgram_values = build_hgram['values']
        for bucket, bucket_value in h_values['values'].iteritems():
            try:
                build_hgram_values[bucket] += bucket_value
            except KeyError:
                build_hgram_values[bucket] = bucket_value
    
        build_hgram['sum'] += h_values['sum']
f.close()
outdir = sys.argv[2]

keyfile = open("%s/key.json" % outdir, 'w')
keyfile.write(json.dumps(root))
keyfile.close()

for filter_id, builds in histogram_data.iteritems():
    for buildDate,build in builds.iteritems():
        name = "%s/%d-%s.json" % (outdir, filter_id, buildDate)
        buildfile = open(name, 'w')
        buildfile.write(json.dumps(build))
        buildfile.close()
        print "wrote %s" %name

print "%d lines decoded\n" % lineno
print [idcount]
