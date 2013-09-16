try:
    import simplejson as json
    print "Using simplejson for faster json parsing"
except ImportError:
    import json
import sys
import telemetryutils
import jydoop
import math


verbose = True

# Auxiliary method for computing bucket offsets from parameters, it is stolen
# from histogram_tools.py, though slightly modified...
def exponential_buckets(dmin, dmax, n_buckets):
    log_max = math.log(dmax);
    ret_array = [0] * n_buckets
    current = dmin
    ret_array[1] = current
    for bucket_index in range(2, n_buckets):
        log_current = math.log(current)
        log_ratio = (log_max - log_current) / (n_buckets - bucket_index)
        log_next = log_current + log_ratio
        next_value = int(math.floor(math.exp(log_next) + 0.5))
        if next_value > current:
            current = next_value
        else:
            current = current + 1
        ret_array[bucket_index] = current
    return ret_array

# Create buckets from buckets2index from ranges... snippet pretty much stolen
# from specgen.py
def buckets2index_from_ranges(ranges):
    buckets = map(str, ranges)
    bucket2index = {}
    for i in range(0, len(buckets)):
        bucket2index[buckets[i]] = i
    return bucket2index

# Bucket offsets for simple measures
simple_measures_buckets = (
                           buckets2index_from_ranges(
                                            exponential_buckets(1, 30000, 50)),
                           exponential_buckets(1, 30000, 50)
                           )


SPECS = "scripts/histogram_specs.json"
histogram_specs = json.loads(
    jydoop.getResource(SPECS))

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
    except (KeyError, IndexError, UnicodeEncodeError):
        if verbose:
            msg = "error while unpacking the payload"
            print >> sys.stderr, msg
        return

    # TODO: histogram_specs should specify the list of versions/channels we
    #       care about
    if not channel in ['release', 'aurora', 'nightly', 'beta', 'nightly-ux']:
        return

    # todo combine OS + osVersion + santize on crazy platforms like linux to
    #      reduce pointless choices
    if OS == "Linux":
        osVersion = osVersion[:3]

    path = (buildDate, reason, appName, OS, osVersion, arch)
    # Sanitize path
    for val in path:
        if not isinstance(val, basestring) and type(val) in (int, float, long):
            if verbose:
                print >> sys.stderr, "Found type %s in path" % type(val)
            return

    # Sanitize channel and appVersion
    for val in (channel, appVersion):
        if not isinstance(val, basestring) and type(val) in (int, float, long):
            if verbose:
                print >> sys.stderr, ("Found type %s in channel or appVersion" %
                                      type(val))
            return

    histograms = payload.get('histograms', None)
    if histograms is None:
        histograms = {}
        if verbose:
            msg = "histograms is None in map"
            print >> sys.stderr, msg
    for h_name, h_values in histograms.iteritems():
        bucket2index = histogram_specs.get(h_name, None)
        if bucket2index is None:
            if verbose:
                msg = "bucket2index is None in map"
                print >> sys.stderr, msg
            continue
        else:
            bucket2index = bucket2index[0]

        # most buckets contain 0s, so preallocation is a significant win
        outarray = [0] * (len(bucket2index) + 4)

        index_error = False
        type_error = False
        if not isinstance(h_values, dict):
            if verbose:
                msg = "h_values is not a dictionary"
                print >> sys.stderr, msg
            continue

        values = h_values.get('values', None)
        if values is None:
            continue
        for bucket, value in values.iteritems():
            index = bucket2index.get(bucket, None)
            if index is None:
                #print "%s's does not feature %s bucket in schema"
                #    % (h_name, bucket)
                index_error = True
                break
            if type(value) not in (int, long, float):
                type_error = True
                if verbose:
                    print >> sys.stderr, "Bad value type: %s " % repr(value)
                break
            outarray[index] = value
        if index_error:
            if verbose:
                msg = "index is None in map"
                print >> sys.stderr, msg
            continue
        if type_error:
            if verbose:
                msg = "value is not int, long or float"
                print >> sys.stderr, msg
            continue

        histogram_sum = h_values.get('sum', None)
        if histogram_sum is None:
            if verbose:
                msg = "histogram_sum is None in map"
                print >> sys.stderr, msg
            continue
        if type(histogram_sum) not in (int, long, float):
            if verbose:
                msg = ("histogram_sum is not int, long or float, but: %s" %
                       type(histogram_sum))
                print >> sys.stderr, msg
            continue
        # if statistics isn't available we just leave the two slots as zeroes
        if 'sum_squares_hi' in h_values and 'sum_squares_lo' in h_values:
            outarray[-4] = h_values.get('sum_squares_hi', 0)
            outarray[-3] = h_values.get('sum_squares_lo', 0)
        elif 'log_sum' in h_values and 'log_sum_squares' in h_values:
            outarray[-4] = h_values.get('log_sum', 0)
            outarray[-3] = h_values.get('log_sum_squares', 0)
        if type(outarray[-4]) not in (int, long, float):
            if verbose:
                print >> sys.stderr, ("sum_squares_hi or log_sum is type %s" %
                                      type(outarray[-4]))
            continue
        if type(outarray[-3]) not in (int, long, float):
            if verbose:
                msg = ("sum_squares_lo or log_sum_squares is type %s" %
                       type(outarray[-3]))
                print >> sys.stderr, msg
            continue
        outarray[-2] = histogram_sum
        outarray[-1] = 1        # count
        try:
            context.write((channel, appVersion, h_name), {path: outarray})
        except TypeError:
            dict_locations = [p for p, t in enumerate(path) if type(t) is dict]
            if dict_locations:
                field_names = ["buildDate", "reason", "appName", "OS",
                               "osVersion", "arch"]
                dict_field_names = [field_names[i] for i in dict_locations]
                msg = ("unable to hash the following `path` fields: %s" %
                       (' '.join(dict_field_names)))
            else:
                msg = "TypeError when writing map output."
            if verbose:
                print >> sys.stderr, msg
            continue

    # Now read and output simple measures
    simple_measures = payload.get('simpleMeasurements', None)
    if simple_measures is None:
        if verbose:
            msg = "SimpleMeasures are missing..."
            print >> sys.stderr, msg
        return
    for sm_name, sm_value in simple_measures.iteritems():
        # Handle cases where the value is a dictionary of simple measures
        if type(sm_value) == dict:
            for sub_name, sub_value in sm_value.iteritems():
                map_simplemeasure(channel, appVersion, path,
                                  sm_name + "_" + sub_name, sub_value, context)
        else:
            map_simplemeasure(channel, appVersion, path, sm_name, sm_value,
                              context)


# Map a simple measure
def map_simplemeasure(channel, appVersion, path, name, value, context):
    # Sanity check value
    if type(value) not in (int, long):
        if verbose:
            msg = ("%s is not a value type for simpleMeasurements \"%s\"" %
                   (type(value), name))
            print >> sys.stderr, msg
        return

    bucket = simple_measures_buckets[1]
    outarray = [0] * (len(bucket) + 5)
    for i in reversed(range(0, len(bucket))):
        if value >= bucket[i]:
            outarray[i] = 1
            break

    log_val = math.log(math.fabs(value) + 1)
    outarray[-4] = log_val              # log_sum
    outarray[-3] = log_val * log_val    # log_sum_squares
    outarray[-2] = value                # sum
    outarray[-1] = 1                    # count

    # Output result array
    context.write((channel, appVersion, "SIMPLE_MEASURES_" + name.upper()), 
                  {path: outarray})


def commonCombine(values):
    out = {}
    for d in values:
        for filter_path, histogram in d.iteritems():
            existing = out.get(filter_path, None)
            if existing is None:
                out[filter_path] = histogram
                continue
            for y in range(0, len(histogram)):
                existing[y] += (histogram[y] or 0)
    return out


def combine(key, values, context):
    out = commonCombine(values)
    context.write(key, out)


def reduce(key, values, context):
    out = commonCombine(values)
    out_values = {}
    h_name = key[2]
    for (filter_path, histogram) in out.iteritems():
        # first, discard any malformed (non int) entries, while allowing floats
        # in the statistics
        for i, val in enumerate(histogram):
            T = type(val)
            if T is not int:
                if T is float:
                    if i is len(histogram) - 3 or i is len(histogram) - 4:
                        continue # allow elements of stats to be floats
                msg = ("discarding %s - %s malformed type: %s on index %i" %
                       ('/'.join(filter_path), h_name, T, i))
                if verbose:
                    print >> sys.stderr, msg
                return
        out_values["/".join(filter_path)] = histogram

    if h_name.startswith("SIMPLE_MEASURES_"):
        buckets = simple_measures_buckets[1];
    else:
        # histogram_specs lookup below is guaranteed to succeed, because of mapper
        buckets = histogram_specs.get(h_name)[1]
    final_out = {
        'buckets': buckets,
        'values': out_values
    }
    context.write("/".join(key), json.dumps(final_out))


def output(path, results):
    f = open(path, 'w')
    for k, v in results:
        f.write(k + "\t" + v + "\n")

setupjob = telemetryutils.setupjob
