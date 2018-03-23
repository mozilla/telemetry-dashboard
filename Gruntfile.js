module.exports = function(grunt) {

    grunt.initConfig({
        babel: {
            options: {
                presets: ["env"]
            },
            dist: {
                files: {
                    "dest/es6js/dashboards.js": "src/js/dashboards.es6",
                    "dest/es6js/analytics.js": "src/js/analytics.es6",
                    "dest/es6js/dist.js": "src/js/dist.es6"
                }
            }
        },
        uglify: {
            dist: {
                files: {
                    "dest/dist.min.js": [
                        "libs/jquery-1.11.3.js",
                        "libs/bootstrap-3.3.7.js",
                        "libs/bootstrap-multiselect-0.9.13.js",
                        "libs/moment-2.20.1.js",
                        "libs/daterangepicker-1.3.23.js",
                        "libs/elessar-1.8.5.js",
                        "libs/d3-3.5.5.js",
                        "libs/metricsgraphics-2.7.0.js",
                        "libs/d3pie-0.1.9.js",
                        "v2/telemetry.js",
                        "dest/es6js/dashboards.js",
                        "dest/es6js/analytics.js" ,
                        "dest/es6js/dist.js"
                    ]
                }
            }
        },
        cssmin: {
            dist: {
                files: {
                    "dest/dist.min.css": [
                        "libs/bootstrap-3.3.7.css",
                        "libs/font-awesome-4.7.0.css",
                        "libs/bootstrap-multiselect-0.9.13.css",
                        "libs/daterangepicker-bs3-1.3.23.css",
                        "libs/elessar-1.8.5.css",
                        "libs/metricsgraphics-2.7.0.css",
                        "src/css/dashboards.css"
                    ]
                }
            }
        },
        clean: {
            all: ["dest/"],
            babel: ["dest/es6js/"]
        },
        copy: {
            dist: {
                src: "src/dist.html",
                dest: "dest/dist.html" 
            }
        }
    });

    grunt.loadNpmTasks("grunt-babel");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-cssmin");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-copy");

    grunt.registerTask("default", [
        "clean:all",
        "babel",
        "uglify",
        "cssmin",
        "clean:babel",
        "copy"
    ]);
};
