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
    # schema: histogram_name {build_id:{filter_id:histogram_values},...}
    #map_key = (channel, appVersion), (h_name), 
    path = (channel, appVersion, buildDate, reason, appName, OS, osVersion, arch)
    for h_name, h_values in json['histograms'].iteritems():
        bucket2index = histogram_specs.get(h_name, None)
        if bucket2index == None:
            continue

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
        key = (path, h_name)
        context.write(key, outarray)
    
