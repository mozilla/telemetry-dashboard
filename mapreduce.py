def map(uid, json, histogram_specs, context):
    i = json['info']
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

    path = (buildDate, reason, appName, OS, osVersion, arch)
    for h_name, h_values in json['histograms'].iteritems():
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
        context.write((channel, appVersion, h_name), (path, outarray))
    
def reduce(key, values, context):
    out = {}
    for (filter_path, histogram) in values:
        existing = out.get(filter_path, None)
        if existing == None:
            out[filter_path] = histogram
            continue
        for y in range(0, len(histogram)):
            existing[y] += histogram[y] 
    final_out = {}
    for (filter_path, histogram) in out.iteritems():
        final_out["/".join(filter_path)] = histogram
        
    context.write("/".join(key), final_out)
    
