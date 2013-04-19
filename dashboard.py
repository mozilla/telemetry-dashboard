try:
    import ujson as json
    print "Using ujson for faster json parsing"
except ImportError:
    try:
        import simplejson as json
        print "Using simplejson for faster json parsing"
    except ImportError:
        import json
import telemetryutils
import jydoop

histogram_specs = None

def map(uid, line, context):
    global histogram_specs
    if histogram_specs == None:
        #print "loading specs"
        histogram_specs = json.loads(jydoop.getResource("scripts/histogram_specs.json"))

    payload = json.loads(line)
    i = payload['info']
    channel = i.get('appUpdateChannel', "too_old")
    OS = i['OS']
    appName = i['appName']
    reason = i['reason']
    try:
        """
        UnicodeEncodeError: 'ascii' codec can't encode characters in position 7-12: ordinal not in range(128)

        todo: log weirdo stuff like this
        """
        osVersion = str(i['version'])
    except:
        return
    appVersion = i['appVersion']
    arch = i['arch']
    buildDate = i['appBuildID'][:8]
    #print [buildDate, channel, arch]
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
        
        # most buckets contain 0s, so preallocation is a significant win
        outarray = [0] * (len(bucket2index) + 2)
        error = False
        for bucket, value in h_values['values'].iteritems():
            index = bucket2index.get(bucket, None)
            if index == None:
                #print "%s's does not feature %s bucket in schema" % (h_name, bucket)
                error = True
                break
            outarray[index] = value
        if error:
            continue

        outarray[-2] = h_values['sum']
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
    final_out = {}
    for (filter_path, histogram) in out.iteritems():
        final_out["/".join(filter_path)] = histogram
    context.write("/".join(key), final_out)

setupjob = telemetryutils.setupjob
