V23=validation/nightly/23.0a1/histogram_descriptions.json
FILES= histogram_tools.py $(V23) histogram_specs.json
download: $(FILES)

$(V23):
	mkdir -p `dirname $@`
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/139b6ba547fa/toolkit/components/telemetry/Histograms.json -O $@

histogram_tools.py:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/139b6ba547fa/toolkit/components/telemetry/histogram_tools.py -O $@

histogram_specs.json: $(V23)
	python specgen.py $< > $@


clean:
	rm -f $(FILES)
