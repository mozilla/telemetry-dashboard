FILES= histogram_tools.py validation/nightly/23/Histograms.json
download: $(FILES)

validation/nightly/23/Histograms.json:
	mkdir -p `dirname $@`
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/139b6ba547fa/toolkit/components/telemetry/Histograms.json -O $@

histogram_tools.py:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/139b6ba547fa/toolkit/components/telemetry/histogram_tools.py -O $@

clean:
	rm -f $(FILES)
