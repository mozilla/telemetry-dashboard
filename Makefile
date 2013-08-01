V25=validation/nightly/25.0a1/histogram_descriptions.json
FILES= histogram_tools.py $(V25) histogram_specs.json
download: $(FILES)

$(V25):
	mkdir -p `dirname $@`
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/Histograms.json -O $@

histogram_tools.py:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/histogram_tools.py -O $@

histogram_specs.json: $(V25)
	python specgen.py $< > $@


clean:
	rm -f $(FILES)
