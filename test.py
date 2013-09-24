
# Auxiliary method to write log messages
def log(msg):
    if verbose:
        print >> sys.stderr, msg

def map(key, dims, value, context):
    # Unpack dimensions
    reason, appName, channel, version, buildId, submissionDate = dims

    # Get the major version
    majorVersion = version.split('.')[0]

    # Get the build date, ignore the rest of the buildId
    buildDate = buildId[:8]

    # Load JSON payload
    payload = json.loads(value)

    # Get OS, osVersion and architecture information
    try:
        info = payload['info']
        OS = info['OS']
        osVersion = str(info['version'])
        arch = info['arch']
    except (KeyError, IndexError, UnicodeEncodeError):
        log("error while unpacking the payload")
        return

    # todo combine OS + osVersion + santize on crazy platforms like linux to
    #      reduce pointless choices
    if OS == "Linux":
        osVersion = osVersion[:3]

    # Create filter path
    filterPath = (buildDate, reason, appName, OS, osVersion, arch)

    # For each histogram
    for hgramName, hgramValues in payload.get('histograms', {}).iteritems():
        context.write((channel, majorVersion, hgramName),
                      {filterPath: hgramValues})

def commonCombine(values):
    output = {}
    for d in values:
        for filterPath, hgramValues in d.iteritems():
            existing = output.get(filterPath, None)
            if existing is None:
                output[filter_path] = hgramValues
                continue
            for y in xrange(0, len(hgramValues)):
                existing[y] += (hgramValues[y] or 0)
    return output

def reduce(key, values, context):
    context.write("/".join(key), json.dumps(commonCombine(values)))
