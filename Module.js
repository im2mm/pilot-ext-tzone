/**
 * Temperature and Humidity Report — PILOT Extension (single-file build).
 *
 * Adds a navigation tab with an icon at the top of the side rail (same look
 * as the planets example), a vehicle checkbox list, From / To date-time
 * pickers, and a "Generate Report" button. Selected vehicles + time range
 * are sent to a sensor-history endpoint and rendered in the paired main
 * panel as a grid of temperature and humidity readings.
 *
 * Everything is defined in this single file so PILOT only needs to load
 * Module.js — no cross-file class loading is required.
 */

/* ------------------------------------------------------------------ */
/* Navigation tab — appears in skeleton.navigation                     */
/* ------------------------------------------------------------------ */
Ext.define('Store.temp_humidity_report.Tab', {
    extend: 'Pilot.utils.LeftBarPanel',
    xtype: 'thr-tab',
    cls: 'tab_clipped leftbarpanel thr-nav',
    bodyCls: 'left_top_round',
    iconCls: 'fa fa-thermometer-half',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    initComponent: function () {
        var me = this;

        me.title = l('Temp/Humidity');
        me.tooltip = l('Temperature and Humidity Report');

        me.vehStore = Ext.create('Ext.data.Store', {
            fields: ['agentid', 'name', 'group'],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        var now = new Date();
        var dayAgo = Ext.Date.subtract(now, Ext.Date.DAY, 1);
        var DateTimeXType = Ext.ClassManager.getByAlias('widget.datetimefield') ?
            'datetimefield' : 'datefield';

        me.items = [{
            xtype: 'grid',
            itemId: 'vehGrid',
            store: me.vehStore,
            border: false,
            cls: 'thr-vehicle-grid',
            emptyText: l('No vehicles available'),
            selModel: {
                type: 'checkboxmodel',
                checkOnly: true,
                mode: 'MULTI',
                showHeaderCheckbox: true
            },
            columns: [{
                text: l('Vehicle'),
                dataIndex: 'name',
                flex: 1,
                renderer: function (v) { return Ext.String.htmlEncode(v || ''); }
            }, {
                text: l('Group'),
                dataIndex: 'group',
                width: 110,
                renderer: function (v) { return Ext.String.htmlEncode(v || ''); }
            }],
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                cls: 'thr-toolbar transparent_buttons dark_form',
                items: [{
                    xtype: 'button',
                    text: l('Generate Report'),
                    iconCls: 'fa fa-file-export',
                    cls: 'thr-generate-btn',
                    handler: me.onGenerateReport,
                    scope: me
                }, '->', {
                    xtype: 'button',
                    iconCls: 'fa fa-rotate',
                    tooltip: l('Reload vehicles'),
                    handler: me.loadVehicles,
                    scope: me
                }]
            }, {
                xtype: 'toolbar',
                dock: 'top',
                cls: 'thr-toolbar',
                layout: { type: 'hbox', align: 'middle' },
                items: [{
                    xtype: DateTimeXType,
                    itemId: 'startDate',
                    fieldLabel: l('From'),
                    labelWidth: 40,
                    flex: 1,
                    value: dayAgo
                }, { xtype: 'tbspacer', width: 4 }, {
                    xtype: DateTimeXType,
                    itemId: 'endDate',
                    fieldLabel: l('To'),
                    labelWidth: 30,
                    flex: 1,
                    value: now
                }]
            }, {
                xtype: 'toolbar',
                dock: 'top',
                cls: 'thr-toolbar',
                items: [{
                    xtype: 'button',
                    iconCls: 'fa fa-check-square',
                    text: l('Select all'),
                    handler: me.onSelectAll,
                    scope: me
                }, {
                    xtype: 'button',
                    iconCls: 'far fa-square',
                    text: l('Clear'),
                    handler: me.onClearAll,
                    scope: me
                }]
            }]
        }];

        me.callParent(arguments);

        me.on('afterrender', me.loadVehicles, me, { single: true });
    },

    /**
     * Vehicles already live in skeleton.navigation.online.online_tree.store
     * (canonical cascadeBy pattern). If the tree isn't populated yet we wait
     * for its load; fall back to /ax/tree.php as a last resort.
     */
    loadVehicles: function () {
        var me = this;
        var grid = me.down('#vehGrid');

        if (grid) { grid.setLoading(l('Loading vehicles...')); }

        var online = skeleton.navigation && skeleton.navigation.online;
        var onlineTree = online && online.online_tree;
        var store = onlineTree && onlineTree.store;

        if (!store) {
            me.loadVehiclesViaAjax();
            return;
        }

        var root = store.getRootNode && store.getRootNode();

        if (root && root.hasChildNodes()) {
            me.populateFromOnlineTree(root);
            if (grid) { grid.setLoading(false); }
            return;
        }

        store.on('load', function () {
            var r = store.getRootNode();
            if (r && r.hasChildNodes()) {
                me.populateFromOnlineTree(r);
            } else {
                me.loadVehiclesViaAjax();
            }
            if (grid) { grid.setLoading(false); }
        }, me, { single: true });

        if (store.load && !store.isLoading()) {
            try { store.load(); } catch (e) { me.loadVehiclesViaAjax(); }
        }
    },

    populateFromOnlineTree: function (root) {
        var rows = [];

        root.cascadeBy(function (node) {
            if (!node || !node.data) { return; }

            var d = node.data;
            if (d.leaf && d.agentid != null) {
                var groupName = '';
                var parent = node.parentNode;
                if (parent && parent.data && !parent.isRoot()) {
                    groupName = parent.data.name || parent.data.text || '';
                }

                rows.push({
                    agentid: d.agentid,
                    name: d.name || d.text || ('#' + d.agentid),
                    group: groupName
                });
            }
        });

        this.vehStore.loadData(rows);
    },

    loadVehiclesViaAjax: function () {
        var me = this;
        var grid = me.down('#vehGrid');

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function (resp) {
                if (grid) { grid.setLoading(false); }

                var data;
                try {
                    data = Ext.decode(resp.responseText);
                } catch (e) {
                    Ext.Msg.alert(l('Error'), l('Bad response from PILOT'));
                    return;
                }

                var rows = [];
                me.flattenVehicles(data, '', rows);
                me.vehStore.loadData(rows);
            },
            failure: function () {
                if (grid) { grid.setLoading(false); }
                Ext.Msg.alert(l('Error'), l('Failed to load vehicles'));
            }
        });
    },

    flattenVehicles: function (nodes, parentName, out) {
        var me = this;

        if (!nodes) { return; }
        if (!Ext.isArray(nodes)) {
            if (nodes.children || nodes.items) {
                nodes = nodes.children || nodes.items;
            } else {
                return;
            }
        }

        Ext.Array.forEach(nodes, function (n) {
            if (!n) { return; }

            var isVehicle = n.agentid != null ||
                n.veh === 1 || n.veh === true ||
                n.type === 'veh' || n.type === 'vehicle' ||
                n.leaf === true;

            if (isVehicle && (n.agentid != null || n.id != null)) {
                out.push({
                    agentid: n.agentid != null ? n.agentid : n.id,
                    name: n.name || n.text || ('#' + (n.agentid || n.id)),
                    group: parentName || ''
                });
            }

            if (n.children && n.children.length) {
                var nextParent = isVehicle ? parentName : (n.name || n.text || parentName);
                me.flattenVehicles(n.children, nextParent, out);
            }
        });
    },

    onSelectAll: function () {
        var grid = this.down('#vehGrid');
        if (grid) { grid.getSelectionModel().selectAll(true); }
    },

    onClearAll: function () {
        var grid = this.down('#vehGrid');
        if (grid) { grid.getSelectionModel().deselectAll(true); }
    },

    onGenerateReport: function () {
        var me = this;
        var grid = me.down('#vehGrid');
        var selected = grid ? grid.getSelectionModel().getSelection() : [];

        if (!selected.length) {
            Ext.Msg.alert(l('Info'), l('Please select at least one vehicle'));
            return;
        }

        var startField = me.down('#startDate');
        var endField = me.down('#endDate');
        var start = startField && startField.getValue();
        var end = endField && endField.getValue();

        if (!start || !end) {
            Ext.Msg.alert(l('Info'), l('Please set both From and To dates'));
            return;
        }

        if (start.getTime() >= end.getTime()) {
            Ext.Msg.alert(l('Info'), l('From must be earlier than To'));
            return;
        }

        var vehicles = Ext.Array.map(selected, function (r) {
            return { agentid: r.get('agentid'), name: r.get('name') };
        });

        if (!me.map_frame || !me.map_frame.loadReport) {
            Ext.Msg.alert(l('Error'), l('Report panel is not available'));
            return;
        }

        me.map_frame.loadReport(vehicles, start, end);
    }
});

/* ------------------------------------------------------------------ */
/* Main panel — paired with the nav tab via navTab.map_frame           */
/* ------------------------------------------------------------------ */
Ext.define('Store.temp_humidity_report.Map', {
    extend: 'Ext.panel.Panel',
    xtype: 'thr-map',
    layout: 'fit',
    cls: 'thr-main',
    closable: false,
    border: false,

    reportUrl: '/ax/report.php',
    reportType: 'temp_humidity',

    initComponent: function () {
        var me = this;

        me.title = l('Temperature and Humidity Report');

        me.reportStore = Ext.create('Ext.data.Store', {
            fields: [
                'agentid', 'name',
                { name: 'ts', type: 'int' },
                { name: 'temp', type: 'float' },
                { name: 'humidity', type: 'float' }
            ],
            sorters: [
                { property: 'name', direction: 'ASC' },
                { property: 'ts', direction: 'ASC' }
            ],
            groupField: 'name'
        });

        me.items = [{
            xtype: 'grid',
            itemId: 'reportGrid',
            store: me.reportStore,
            border: false,
            cls: 'thr-report-grid',
            emptyText: l('Select vehicles and time range, then press Generate Report'),
            features: [{
                ftype: 'grouping',
                groupHeaderTpl: '{name} ({rows.length})',
                hideGroupedHeader: false,
                startCollapsed: false
            }],
            columns: [{
                text: l('Vehicle'),
                dataIndex: 'name',
                flex: 1,
                renderer: function (v) { return Ext.String.htmlEncode(v || ''); }
            }, {
                text: l('Time'),
                dataIndex: 'ts',
                width: 180,
                renderer: function (v) {
                    if (!v) { return ''; }
                    if (typeof dateTimeStrF === 'function') { return dateTimeStrF(v); }
                    if (typeof dateTimeStr === 'function') { return dateTimeStr(v); }
                    return Ext.Date.format(new Date(v * 1000), 'Y-m-d H:i:s');
                }
            }, {
                text: l('Temperature, °C'),
                dataIndex: 'temp',
                width: 150,
                align: 'right',
                renderer: function (v) {
                    if (v == null || v === '') { return '—'; }
                    return typeof num === 'function' ? num(v, 1) :
                        Ext.util.Format.number(v, '0.0');
                }
            }, {
                text: l('Humidity, %'),
                dataIndex: 'humidity',
                width: 130,
                align: 'right',
                renderer: function (v) {
                    if (v == null || v === '') { return '—'; }
                    return typeof num === 'function' ? num(v, 1) :
                        Ext.util.Format.number(v, '0.0');
                }
            }],
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                cls: 'thr-report-toolbar',
                items: [{
                    xtype: 'tbtext',
                    itemId: 'summary',
                    text: l('No report yet')
                }, '->', {
                    xtype: 'button',
                    iconCls: 'fa fa-chart-line',
                    text: l('Chart'),
                    handler: me.onShowChart,
                    scope: me
                }, {
                    xtype: 'button',
                    iconCls: 'fa fa-file-csv',
                    text: l('Export CSV'),
                    handler: me.onExportCsv,
                    scope: me
                }]
            }]
        }];

        me.callParent(arguments);
    },

    loadReport: function (vehicles, start, end) {
        var me = this;
        var grid = me.down('#reportGrid');
        var summary = me.down('#summary');

        me.reportStore.removeAll();
        if (summary) { summary.setText(l('Loading...')); }
        if (grid) { grid.setLoading(l('Loading report...')); }

        var agentIds = Ext.Array.map(vehicles, function (v) { return v.agentid; });
        var nameByAgent = {};
        Ext.Array.forEach(vehicles, function (v) { nameByAgent[v.agentid] = v.name; });

        var startTs = Math.floor(start.getTime() / 1000);
        var endTs = Math.floor(end.getTime() / 1000);

        Ext.Ajax.request({
            url: me.reportUrl,
            params: {
                type: me.reportType,
                agents: agentIds.join(','),
                from: startTs,
                to: endTs
            },
            success: function (resp) {
                if (grid) { grid.setLoading(false); }

                var data;
                try {
                    data = Ext.decode(resp.responseText);
                } catch (e) {
                    if (summary) { summary.setText(''); }
                    Ext.Msg.alert(l('Error'), l('Bad response from report endpoint'));
                    return;
                }

                var rows = (data && (data.rows || data.data)) ||
                    (Ext.isArray(data) ? data : []);

                var normalized = Ext.Array.map(rows, function (r) {
                    var agentid = r.agentid != null ? r.agentid : r.id;
                    return {
                        agentid: agentid,
                        name: r.name || nameByAgent[agentid] || ('#' + agentid),
                        ts: r.ts || r.time || r.t,
                        temp: r.temp != null ? r.temp :
                            (r.temperature != null ? r.temperature : r.t1),
                        humidity: r.humidity != null ? r.humidity :
                            (r.hum != null ? r.hum : r.h1)
                    };
                });

                me.reportStore.loadData(normalized);

                if (summary) {
                    summary.setText(Ext.String.format(
                        l('{0} rows · {1} vehicles · {2} — {3}'),
                        normalized.length,
                        agentIds.length,
                        Ext.Date.format(start, 'Y-m-d H:i'),
                        Ext.Date.format(end, 'Y-m-d H:i')));
                }

                if (!normalized.length) {
                    Ext.Msg.alert(l('Info'),
                        l('No temperature/humidity data in the selected range'));
                }
            },
            failure: function (resp) {
                if (grid) { grid.setLoading(false); }
                if (summary) { summary.setText(''); }
                Ext.Msg.alert(l('Error'),
                    l('Report request failed') + ' (HTTP ' + resp.status + ')');
            }
        });
    },

    onShowChart: function () {
        var me = this;
        var rows = me.reportStore.getRange();

        if (!rows.length) {
            Ext.Msg.alert(l('Info'), l('Nothing to chart'));
            return;
        }

        if (!window.Highcharts) {
            Ext.Msg.alert(l('Error'), l('Highcharts is not available in this build'));
            return;
        }

        var byVehicle = {};
        Ext.Array.forEach(rows, function (r) {
            var name = r.get('name') || '#' + r.get('agentid');
            if (!byVehicle[name]) { byVehicle[name] = { temp: [], hum: [] }; }
            var t = (r.get('ts') || 0) * 1000;
            if (r.get('temp') != null) {
                byVehicle[name].temp.push([t, Number(r.get('temp'))]);
            }
            if (r.get('humidity') != null) {
                byVehicle[name].hum.push([t, Number(r.get('humidity'))]);
            }
        });

        var series = [];
        Ext.Object.each(byVehicle, function (name, buckets) {
            if (buckets.temp.length) {
                series.push({
                    name: name + ' — ' + l('Temp °C'),
                    data: buckets.temp, yAxis: 0
                });
            }
            if (buckets.hum.length) {
                series.push({
                    name: name + ' — ' + l('Hum %'),
                    data: buckets.hum, yAxis: 1, dashStyle: 'ShortDash'
                });
            }
        });

        var win = Ext.create('Ext.window.Window', {
            title: l('Temperature and Humidity'),
            modal: true,
            width: 900,
            height: 520,
            layout: 'fit',
            items: [{ xtype: 'container', itemId: 'chartHost' }]
        });

        win.show();
        win.on('afterrender', function () {
            var host = win.down('#chartHost').getEl().dom;
            Highcharts.chart(host, {
                chart: { type: 'line', zoomType: 'x' },
                title: { text: l('Temperature and Humidity') },
                xAxis: { type: 'datetime' },
                yAxis: [
                    { title: { text: l('Temperature, °C') } },
                    { title: { text: l('Humidity, %') }, opposite: true }
                ],
                tooltip: { shared: true, crosshairs: true },
                series: series
            });
        }, null, { single: true });
    },

    onExportCsv: function () {
        var me = this;
        var rows = me.reportStore.getRange();

        if (!rows.length) {
            Ext.Msg.alert(l('Info'), l('Nothing to export'));
            return;
        }

        var lines = ['vehicle,time,temperature_c,humidity_pct'];
        Ext.Array.forEach(rows, function (r) {
            var ts = r.get('ts');
            var timeStr = ts ?
                (typeof dateTimeStrF === 'function' ? dateTimeStrF(ts) :
                    Ext.Date.format(new Date(ts * 1000), 'Y-m-d H:i:s')) :
                '';
            var name = (r.get('name') || '').replace(/"/g, '""');
            lines.push('"' + name + '","' + timeStr + '",' +
                (r.get('temp') != null ? r.get('temp') : '') + ',' +
                (r.get('humidity') != null ? r.get('humidity') : ''));
        });

        var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'temp_humidity_report.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});

/* ------------------------------------------------------------------ */
/* Module entry — PILOT calls initModule()                             */
/* ------------------------------------------------------------------ */
Ext.define('Store.temp_humidity_report.Module', {
    extend: 'Ext.Component',

    initModule: function () {
        console.log('Temp/Humidity Report: initModule()');

        if (!window.skeleton || !skeleton.navigation) {
            Ext.log({ level: 'warn' }, 'Temp/Humidity: skeleton.navigation not ready');
            return;
        }

        var mainFrame = skeleton.mapframe || skeleton.map_frame;
        if (!mainFrame || !mainFrame.add) {
            Ext.log({ level: 'warn' }, 'Temp/Humidity: main frame not ready');
            return;
        }

        this.injectStyles();

        var nav = Ext.create('Store.temp_humidity_report.Tab', {});
        var main = Ext.create('Store.temp_humidity_report.Map', {});

        nav.map_frame = main;

        skeleton.navigation.add(nav);
        mainFrame.add(main);
    },

    injectStyles: function () {
        if (document.getElementById('thr-styles')) { return; }

        var css = [
            '.thr-nav .thr-toolbar{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:4px 6px;}',
            '.thr-nav .thr-generate-btn{background:#0ea5e9;border-color:#0284c7;color:#fff;font-weight:600;}',
            '.thr-nav .thr-generate-btn .x-btn-inner,.thr-nav .thr-generate-btn .x-btn-icon-el{color:#fff;}',
            '.thr-nav .thr-generate-btn:hover{background:#0284c7;}',
            '.thr-nav .thr-vehicle-grid .x-grid-row-over .x-grid-cell{background:#e0f2fe;}',
            '.thr-nav .thr-vehicle-grid .x-grid-item-selected .x-grid-cell{background:#bae6fd;}',
            '.thr-main .thr-report-toolbar{background:#f1f5f9;border-bottom:1px solid #e2e8f0;}',
            '.thr-main .thr-report-grid .x-column-header-inner{color:#0f172a;font-weight:600;}',
            '.thr-main .thr-report-grid .x-grid-row-alt .x-grid-cell{background:#f8fafc;}',
            '.thr-main .thr-report-grid .x-grid-group-hd{background:#e2e8f0;color:#0f172a;}'
        ].join('');

        var style = document.createElement('style');
        style.id = 'thr-styles';
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }
});
