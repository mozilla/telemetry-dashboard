JSONS=validation/nightly/23/Histograms.json
download: $(JSONS)

validation/nightly/23/Histograms.json:
	mkdir -p `dirname $@`
	wget -c http://hg.mozilla.org/mozilla-central/raw-file/139b6ba547fa/toolkit/components/telemetry/Histograms.json -O $@

clean:
	rm -f $(JSONS)
