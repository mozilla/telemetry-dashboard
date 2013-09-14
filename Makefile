FILES= histogram_tools.py Histograms.json histogram_specs.json
download: $(FILES)

Histograms.json:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/Histograms.json -O $@

histogram_tools.py:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/histogram_tools.py -O $@

histogram_specs.json: Histograms.json
	python specgen.py $< > $@

clean:
	rm -f $(FILES)
