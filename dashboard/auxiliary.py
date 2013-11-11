import sys, math

class HistogramAggregator:
    """ Object that accumulates a single histogram, ie. it aggregates histograms
        Format of values is
        [
            bucket0,
            bucket1,
            ...,
            bucketN,
            sum,                # -1, if missing
            log_sum,            # -1, if missing
            log_sum_squares,    # -1, if missing
            sum_squares_lo,     # -1, if missing
            sum_squares_hi,     # -1, if missing
            count
        ]
        Ie. same format as telemetry-server validated histograms with an extra
        count field.

        Notice that constructor for this object takes same values as constructed
        by the dump() method. Hence, dump = aggregator.dump() followed by
        HistogramAggregator(**dump) will restore the aggregator.
        (Notice without JSON dumps/loads this is just a shallow copy!)

        Like wise aggregators can be merged:
        aggregator1.merge(**aggregator2.dump())
    """
    def __init__(self, values = [], buildId = "", revision = None):
        replace_nan_inf(values)
        self.values = values
        self.buildId = buildId
        self.revision = revision

    def merge(self, values, buildId, revision):
        # If length of values don't match up, we have two different histograms
        if len(self.values) != len(values):
            # Choose the histogram with highest buildId
            if self.buildId < buildId:
                self.values = values
                self.buildId = buildId
                self.revision = revision
        else:
            if self.buildId < buildId:
                self.values = values
                self.buildId = buildId
            for i in xrange(0, len(values) - 6):
                self.values[i] += values[i]
            # Entries [-6:-1] may have -1 indicating missing entry
            for i in xrange(len(values) - 6, len(values) - 1):
                # Missing entries are indicated with -1, we shouldn't add these up
                if self.values[i] == -1 and values[i] == -1:
                    continue
                self.values[i] += values[i]
            # Last entry cannot be negative
            self.values[-1] += values[-1]
        # Remove Nan and Inf
        replace_nan_inf(self.values)

    def dump(self):
        return {
            'revision':     self.revision,
            'buildId':      self.buildId,
            'values':       self.values
        }

def replace_nan_inf(values):
    """ Replace NaN and Inf with null and float.max respectively """
    for i in xrange(0, len(values)):
        val = values[i]
        if math.isinf(val):
            if val < 0:
                values[i] = - sys.float_info.max
            else:
                values[i] = sys.float_info.max
        elif math.isnan(val):
            # this isn't good... but we can't handle all possible corner cases
            # NaN shouldn't be possible... besides it's not known to happen
            values[i] = null
