/**
 * Temperature and Humidity Report — PILOT Extension entry point.
 *
 * Adds a navigation tab (icon at the top of the side rail, like the planets
 * example) that lists every vehicle with a checkbox and a From / To date-time
 * pair. Pressing "Generate Report" sends the selection to the paired main
 * panel, which renders a grid of temperature and humidity readings.
 */

Ext.define('Store.temp_humidity_report.Module', {
    extend: 'Ext.Component',

    initModule: function () {
        if (!window.skeleton || !skeleton.navigation) {
            Ext.log('temp_humidity_report: skeleton.navigation not found');
            return;
        }

        var mainFrame = skeleton.mapframe || skeleton.map_frame;
        if (!mainFrame || !mainFrame.add) {
            Ext.log('temp_humidity_report: main frame not found');
            return;
        }

        var nav = Ext.create('Store.temp_humidity_report.Tab', {});
        var main = Ext.create('Store.temp_humidity_report.Map', {});

        nav.map_frame = main;

        skeleton.navigation.add(nav);
        mainFrame.add(main);

        this.loadStyles();
    },

    /**
     * Inject the extension stylesheet by detecting the URL of Module.js
     * (works regardless of the slug the host uses for the extension folder).
     */
    loadStyles: function () {
        if (document.getElementById('thr-extension-css')) {
            return;
        }

        var base = '';
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                base = src.substring(0, src.lastIndexOf('/') + 1);
                break;
            }
        }

        var link = document.createElement('link');
        link.id = 'thr-extension-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = base + 'style.css';
        document.head.appendChild(link);
    }
});
