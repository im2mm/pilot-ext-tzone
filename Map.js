/**
 * Main panel (a.k.a. "Map" by PILOT convention) for the Temperature and
 * Humidity Report extension. The navigation tab links here through
 * `navTab.map_frame` and calls `loadReport(vehicles, start, end)` when the
 * user presses "Generate Report".
 *
 * The default endpoint is /ax/report.php?type=temp_humidity&agents=...&from=...&to=...
 * Set `reportUrl` or `reportType` on construction if your installation uses
 * a different sensor history path or payload.
 */

Ext.define('Store.temp_humidity_report.Map', {
    extend: 'Ext.panel.Panel',
    xtype: 'store-temp-humidity-report-map',
    layout: 'fit',
    cls: 'thr-main',
    closable: false,
    border: false,

    title: undefined,

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
            ]
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

        // Group reportStore by vehicle name so the grouping feature renders rows.
        if (me.reportStore.groupers && me.reportStore.groupers.getCount() === 0) {
            me.reportStore.group('name');
        } else if (me.reportStore.group) {
            me.reportStore.group('name');
        }

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
            if (!byVehicle[name]) {
                byVehicle[name] = { temp: [], hum: [] };
            }
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
                    data: buckets.temp,
                    yAxis: 0
                });
            }
            if (buckets.hum.length) {
                series.push({
                    name: name + ' — ' + l('Hum %'),
                    data: buckets.hum,
                    yAxis: 1,
                    dashStyle: 'ShortDash'
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
