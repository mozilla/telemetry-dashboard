FILES = histogram_tools.py Histograms.json specs.py dashboard.zip
all: $(FILES)

Histograms.json:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/Histograms.json -O $@

histogram_tools.py:
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/components/telemetry/histogram_tools.py -O $@

specs.py: Histograms.json
	python specgen.py $< > $@

dashboard.zip: specs.py processor.py auxiliary.py
	zip $@ $?

clean:
	rm -f $(FILES) *.pyc
