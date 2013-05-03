try:
    import simplejson as json
    print "Using simplejson for faster json parsing"
except ImportError:
    import json
import telemetryutils
import jydoop

histogram_specs = json.loads(jydoop.getResource("scripts/histogram_specs.json"))

def map(uid, line, context):
    global histogram_specs

    payload = json.loads(line)
    try:
        i = payload['info']
        channel = i.get('appUpdateChannel', "too_old")
        OS = i['OS']
        appName = i['appName']
        reason = i['reason']
        osVersion = str(i['version'])
        #only care about major versions
        appVersion = i['appVersion'].split('.')[0]
        arch = i['arch']
        buildDate = i['appBuildID'][:8]
    except:
        return
    
    # TODO: histogram_specs should specify the list of versions/channels we care about
    if not channel in ['release', 'aurora', 'nightly', 'beta', 'nightly-ux']:
        return

    # todo combine OS + osVersion + santize on crazy platforms like linux to reduce pointless choices
    if OS == "Linux":
        osVersion = osVersion[:3]

    path = (buildDate, reason, appName, OS, osVersion, arch)
    histograms = payload.get('histograms', None)
    if histograms == None:
        return
    for h_name, h_values in histograms.iteritems():
        bucket2index = histogram_specs.get(h_name, None)
        if bucket2index == None:
            continue
        else:
            bucket2index = bucket2index[0]
        
        # most buckets contain 0s, so preallocation is a significant win
        outarray = [0] * (len(bucket2index) + 2)
        error = False
        values = h_values.get('values', None)
        if values == None:
            continue
        for bucket, value in values.iteritems():
            index = bucket2index.get(bucket, None)
            if index == None:
                #print "%s's does not feature %s bucket in schema" % (h_name, bucket)
                error = True
                break
            outarray[index] = value
        if error:
            continue

        histogram_sum = h_values.get('sum', None)
        if histogram_sum == None:
            continue
        outarray[-2] = histogram_sum
        outarray[-1] = 1        # count
        context.write((channel, appVersion, h_name), {path: outarray})

def commonCombine(values):
    out = {}
    for d in values:
        for filter_path, histogram in d.iteritems():
            existing = out.get(filter_path, None)
            if existing == None:
                out[filter_path] = histogram
                continue
            for y in range(0, len(histogram)):
                existing[y] += histogram[y] 
    return out

def combine(key, values, context):
    out = commonCombine(values)
    context.write(key, out)

def reduce(key, values, context):
    out = commonCombine(values)
    out_values = {}
    for (filter_path, histogram) in out.iteritems():
        out_values["/".join(filter_path)] = histogram
    h_name = key[2]
    # histogram_specs lookup below is guranteed to succeed, because of mapper
    final_out = {'buckets': histogram_specs.get(h_name)[1], 'values':out_values}
    context.write("/".join(key), json.dumps(final_out))

def output(path, results):
    f = open(path, 'w')
    for k, v in results:
        f.write(k + "\t" + v + "\n")

setupjob = telemetryutils.setupjob
