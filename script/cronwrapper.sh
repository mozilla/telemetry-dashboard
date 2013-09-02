#!/bin/bash

# This is a wrapper for use when running the telemetry-dash bootstrap from
# cron.  It satisfies bug 910306[1] :
# - The presence of STDERR does not necessarily indicate an error.
# - The only indicator of an error is a non-zero exit code.
# - If an error is detected, both STDOUT and STDERR should be displayed.
# - If no error is detected, no email should be generated.
#
# [1] https://bugzilla.mozilla.org/show_bug.cgi?id=910306

set -eu

OUT=/tmp/wrapper.out.$$

set +e
"$@" > $OUT 2>&1
RESULT=$?
set -e

if [ $RESULT -ne 0 ]
    then
    echo "Non-zero exit code detected for $@"
    echo "Exit code: $RESULT"
    echo "---"
    cat $OUT
fi

rm -f "$OUT"
