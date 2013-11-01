from setuptools import setup
setup(
    name                = "telemetry-dashboard",
    version             = "0.1.0",
    zip_safe            = True,
    packages            = ["dashboard"],
    install_requires    = ['boto>=2.15'],
    author              = "Jonas Finnemann Jensen, Chris Lonnen, Taras Glek",
    author_email        = "jopsen@gmail.com",
    description         = "telemetry-dashboard analysis job and aggregator",
    license             = "MPL 2.0",
    keywords            = "telemetry dashboard analysis",
    url                 = "https://github.com/mozilla/telemetry-dashboard",
    entry_points = {
        'telemetry.analysis': [
            'processor = dashboard.analysis:DashboardProcessor'
        ],
        'console_scripts': [
            'result2disk = dashboard.result2disk:main',
            'aggregate_results = dashboard.aggregate_results:main'
        ]
    }
)