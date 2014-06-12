var x = require('../v1/telemetry');
var data = require('./testData');
var assert = require('assert');

//overwrite getUrl from Telemetry.js
x.Telemetry.getUrl = function f(url, cb) {
  var x = url.split("/");
  var y = x[x.length - 1].split(".");
  var z = y[0];
  if (z == "versions") {
    cb(null, data.versions);
  } else if (z == "histograms") {
    cb(null, data.histograms);
  } else if (z == "CYCLE_COLLECTOR-by-build-date") {
    cb(null, data.CYCLE_COLLECTOR_by_build_date);
  } else if  (z == "filter-tree") {
    cb(null, data.filter_tree);
  } else if (z == "A11Y_CONSUMERS-by-build-date") {
    cb(null, data.A11Y_CONSUMERS_by_build_date);
  } else {
    throw "URL NOT RECOGNISED: " + url;
  }
};


describe('tests for telemetry.js', function(){
  before(function(done){
    x.Telemetry.init(function() {
      console.log(x.Telemetry);
      var sortedVersions = x.Telemetry.versions();

      assert.equal(sortedVersions[0], 'nightly/30', "list of versions should be sorted");
      done();
    });
  });

  describe("versions test", function() {
    it('versions should be sorted', function(done){
      var sortedVersions = x.Telemetry.versions();
      assert.equal(sortedVersions[0], 'nightly/30', "list of versions should be sorted");
      assert.equal(sortedVersions[sortedVersions.length - 1], 'nightly/32', "list of versions should be sorted");
      done();
    });
  });

  describe("measures tests", function() {
    it('measures', function(done){
      x.Telemetry.measures('nightly/32', function(measures) {
        assert.equal(measures['CYCLE_COLLECTOR'].kind, 'exponential', "measure should have an enumerated kind");
        assert.equal(measures['A11Y_CONSUMERS'].description, 'Accessibility client by enum id', "measure should have a different description field");
        done();
      });
    });
  });

  describe("loadEvolutionOverBuilds measure description kind filterName filterOptions submissions mean median percentile ", function(){
    it('', function(done){
      x.Telemetry.loadEvolutionOverBuilds('nightly/32', 'CYCLE_COLLECTOR',
        function(histogramEvolution) {
          // Get submissions from a histogram aggregated over all dates
          // in the HistogramEvolution instance
          var x = 323;
          var histogram = histogramEvolution.range();
          // Now log the number of submissions aggregated in the histogram
          assert.equal(histogram.submissions(), x);
          //only date we have data for in moch set
          var d = new Date("May 31, 2014");
          var futureDate = new Date("July 21, 2917");
          histogram = histogramEvolution.range(d);
          assert.equal(histogram.submissions(), x);

          histogram = histogramEvolution.range(null, d);
          assert.equal(histogram.submissions(), x);

          histogram = histogramEvolution.range(d, null);
          assert.equal(histogram.submissions(), x);

          histogram = histogramEvolution.range(d, d);
          assert.equal(histogram.submissions(), x);

          histogram = histogramEvolution.range(futureDate);
          assert.equal(histogram.submissions(), 0);
          assert.equal( histogramEvolution.measure(), 'CYCLE_COLLECTOR', 'mismatched measure');
          assert.equal(histogramEvolution.description(), 'Time spent on one cycle collection (ms)');
          assert.equal(histogramEvolution.kind(), 'exponential', "mismatch in histogram type");
          assert.equal(histogramEvolution.filterName(), 'reason', "mismatched filterName");
          assert.equal(histogramEvolution.filterOptions()[0], 'saved_session', "mismatch between filter options");


          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().submissions(), 4, "wrong number of submissions");
          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().mean(), 98.8814352574103, "wrong mean");
          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().median(), 44.55624492936211, "wrong median");
          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().percentile(5), 30.12765599765058, "wrong 5pt percentile");
          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().percentile(25), 36.45889241147066);
          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().percentile(75), 115.46894918262753);
          assert.equal(histogramEvolution.filter('saved_session').filter('Firefox').range().percentile(95), 193.479073295769);
          done();
        });
    });
  });


  describe("loadEvolutionOverBuilds dates map each", function(){
    it('', function(done){
      x.Telemetry.loadEvolutionOverBuilds('nightly/32', 'A11Y_CONSUMERS',
        function(histogramEvolution) {
          // Get submissions from a histogram aggregated over all dates
          // in the HistogramEvolution instance
          var x = 44291;
          var histogram = histogramEvolution.range();
          // Now log the number of submissions aggregated in the histogram
          assert.equal(histogram.submissions(), x);
          //date we have data for in mock set
          var d = new Date("May 31, 2014");
          var futureDate = new Date("July 21, 2917");
          histogram = histogramEvolution.range(d);
          assert.equal(histogram.submissions(), 12873);

          histogram = histogramEvolution.range(null, d);
          assert.equal(histogram.submissions(), x);

          histogram = histogramEvolution.range(d, null);
          assert.equal(histogram.submissions(), 12873);

          histogram = histogramEvolution.range(d, d);
          assert.equal(histogram.submissions(), 12873);

          histogram = histogramEvolution.range(futureDate);

          assert.equal(histogram.submissions(), 0);

          //dates should be sorted
          assert.equal(histogramEvolution.dates()[0].toJSON(), "2014-05-19T00:00:00.000Z");
          assert.equal(histogramEvolution.dates()[2].toJSON(), "2014-05-31T00:00:00.000Z");
          var submissionsSortedByDate = [12255,19163, 12873];
          histogramEvolution.each(function(date, histogram, index) {
            assert.equal(histogram.submissions(), submissionsSortedByDate[index]);
          });

          var data = histogramEvolution.map(function(date, histogram, index) {
            return {
              x:  date.getTime(), // Use get unix timestamp
              y:  histogram.submissions()
            };
          });

          testData = [ { x: 1400457600000, y: 12255 },
                       { x: 1401433200000, y: 19163 },
                       { x: 1401519600000, y: 12873 } ];

          assert.equal(data[0].x, testData[0].x);
          assert.equal(data[2].y, testData[2].y);
          done();
        });
    });
  });

  describe("exponential histogram tests measure kind filterName filterOptions each map", function(){
    it('should get the right number of buckets in map and each function', function(done){
      x.Telemetry.loadEvolutionOverBuilds('nightly/32', 'CYCLE_COLLECTOR',
        function(histogramEvolution) {
          // Get submissions from a histogram aggregated over all dates
          // in the HistogramEvolution instance
          var histogram = histogramEvolution.range();
          assert.equal(histogram.measure(), 'CYCLE_COLLECTOR');
          assert.equal(histogram.kind(), 'exponential');
          assert.equal(histogram.filterName(), 'reason');
          assert.equal(histogram.filterOptions()[0], 'saved_session');
          var noBuckets = 0;
          histogram.each(function() {
            noBuckets++;
          });
          assert.equal(noBuckets, 50, "for this histogram I should have 50 buckets");
          noBuckets= 0;
          histogram.map(function() {
            noBuckets++;
          });
          assert.equal(noBuckets, 50, "for this histogram I should have 50 buckets");
          done();
        });
    });
  });

});
