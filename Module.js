/**
 * Temperature and Humidity Report Extension
 *
 * Adds a navigation tab with:
 *   - From / To date-time fields
 *   - A "Generate Report" button
 *   - A grid of all PILOT vehicles with checkboxes
 *
 * Selected vehicles + time range are sent to the report endpoint,
 * and the result is shown in the paired main panel as a grid of
 * temperature and humidity readings.
 */

(function () {
    var moduleBase = (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            if (src.indexOf('Module.js') !== -1) {
                return src.substring(0, src.lastIndexOf('/') + 1);
            }
        }
        return '';
    })();

    if (!document.getElementById('thr-extension-css')) {
        var link = document.createElement('link');
        link.id = 'thr-extension-css';
        link.rel = 'stylesheet';
        link.href = moduleBase + 'style.css';
        document.head.appendChild(link);
    }
})();

Ext.define('Store.temp_humidity_report.NavigationContent', {
    extend: 'Ext.panel.Panel',
    layout: 'fit',
    border: false,
    cls: 'thr-nav',

    initComponent: function () {
        var me = this;

        me.vehStore = Ext.create('Ext.data.Store', {
            fields: ['agentid', 'name', 'group'],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        var now = new Date();
        var dayAgo = Ext.Date.subtract(now, Ext.Date.DAY, 1);
        var DateTimeXType = Ext.ClassManager.getByAlias('widget.datetimefield') ?
            'datetimefield' : 'datefield';

        me.dockedItems = [{
            xtype: 'toolbar',
            dock: 'top',
            cls: 'thr-toolbar',
            items: [{
                xtype: 'button',
                text: l('Generate Report'),
                iconCls: 'fa fa-file-export',
                cls: 'thr-generate-btn',
                handler: me.onGenerateReport,
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
            }, { xtype: 'tbspacer', width: 6 }, {
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
            }, '->', {
                xtype: 'button',
                iconCls: 'fa fa-sync',
                tooltip: l('Reload vehicles'),
                handler: me.loadVehicles,
                scope: me
            }]
        }];

        me.items = [{
            xtype: 'grid',
            itemId: 'vehGrid',
            store: me.vehStore,
            border: false,
            cls: 'thr-vehicle-grid',
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
            }]
        }];

        me.callParent(arguments);

        me.loadVehicles();
    },

    loadVehicles: function () {
        var me = this;
        var grid = me.down('#vehGrid');

        if (grid) {
            grid.setLoading(l('Loading vehicles...'));
        }

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
                n.type === 'veh' || n.type === 'vehicle';

            if (isVehicle) {
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

    getMainPanel: function () {
        var me = this;
        if (me.map_frame) { return me.map_frame; }

        var navTab = me.up('pilot-leftbarpanel') || me.up('panel');
        return navTab ? navTab.map_frame : null;
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

        var mainPanel = me.getMainPanel();
        if (!mainPanel || !mainPanel.loadReport) {
            Ext.Msg.alert(l('Error'), l('Report panel is not available'));
            return;
        }

        mainPanel.loadReport(vehicles, start, end);
    }
});

Ext.define('Store.temp_humidity_report.MainPanel', {
    extend: 'Ext.panel.Panel',
    title: l('Temperature and Humidity Report'),
    layout: 'fit',
    closable: false,
    cls: 'thr-main',

    initComponent: function () {
        var me = this;

        me.reportStore = Ext.create('Ext.data.Store', {
            fields: [
                'agentid', 'name',
                { name: 'ts', type: 'int' },
                { name: 'temp', type: 'float' },
                { name: 'humidity', type: 'float' }
            ],
            sorters: [{ property: 'ts', direction: 'ASC' }]
        });

        me.items = [{
            xtype: 'grid',
            itemId: 'reportGrid',
            store: me.reportStore,
            border: false,
            cls: 'thr-report-grid',
            emptyText: l('Select vehicles and time range, then press Generate Report'),
            columns: [{
                text: l('Vehicle'),
                dataIndex: 'name',
                flex: 1,
                renderer: function (v) { return Ext.String.htmlEncode(v || ''); }
            }, {
                text: l('Time'),
                dataIndex: 'ts',
                width: 170,
                renderer: function (v) {
                    if (!v) { return ''; }
                    return typeof dateTimeStrF === 'function' ? dateTimeStrF(v) :
                        (typeof dateTimeStr === 'function' ? dateTimeStr(v) :
                            Ext.Date.format(new Date(v * 1000), 'Y-m-d H:i:s'));
                }
            }, {
                text: l('Temperature, °C'),
                dataIndex: 'temp',
                width: 150,
                align: 'right',
                renderer: function (v) {
                    if (v == null || v === '') { return '—'; }
                    return typeof num === 'function' ? num(v, 1) : Ext.util.Format.number(v, '0.0');
                }
            }, {
                text: l('Humidity, %'),
                dataIndex: 'humidity',
                width: 130,
                align: 'right',
                renderer: function (v) {
                    if (v == null || v === '') { return '—'; }
                    return typeof num === 'function' ? num(v, 1) : Ext.util.Format.number(v, '0.0');
                }
            }],
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                cls: 'thr-report-toolbar',
                items: [{
                    xtype: 'tbtext',
                    itemId: 'summary',
                    text: ''
                }, '->', {
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
        if (summary) { summary.setText(''); }
        if (grid) { grid.setLoading(l('Loading report...')); }

        var agentIds = Ext.Array.map(vehicles, function (v) { return v.agentid; });
        var nameByAgent = {};
        Ext.Array.forEach(vehicles, function (v) { nameByAgent[v.agentid] = v.name; });

        var startTs = Math.floor(start.getTime() / 1000);
        var endTs = Math.floor(end.getTime() / 1000);

        Ext.Ajax.request({
            url: '/ax/report.php',
            params: {
                type: 'temp_humidity',
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
                    Ext.Msg.alert(l('Error'), l('Bad response from report endpoint'));
                    return;
                }

                var rows = data && (data.rows || data.data) ||
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
                        l('{0} rows, {1} vehicles'),
                        normalized.length, agentIds.length));
                }

                if (!normalized.length) {
                    Ext.Msg.alert(l('Info'), l('No temperature/humidity data in the selected range'));
                }
            },
            failure: function (resp) {
                if (grid) { grid.setLoading(false); }
                Ext.Msg.alert(l('Error'),
                    l('Report request failed') + ' (HTTP ' + resp.status + ')');
            }
        });
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

        var LeftTabClass = Ext.ClassManager.get('Pilot.utils.LeftBarPanel') ?
            'Pilot.utils.LeftBarPanel' : 'Ext.panel.Panel';

        var navContent = Ext.create('Store.temp_humidity_report.NavigationContent', {});

        var navTab = Ext.create(LeftTabClass, {
            title: l('Temp/Humidity'),
            iconCls: 'fa fa-thermometer-half',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [navContent]
        });

        var mainPanel = Ext.create('Store.temp_humidity_report.MainPanel', {});

        navTab.map_frame = mainPanel;
        navContent.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        mainFrame.add(mainPanel);
    }
});
