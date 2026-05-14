/**
 * Navigation tab for the Temperature and Humidity Report extension.
 *
 * Extends Pilot.utils.LeftBarPanel so the host gives us the familiar
 * "icon at the top of the side rail" tab (same look as the planets
 * example), while keeping the grid wrapped inside the tab as
 * AI_SPECS §4 Pattern A requires.
 *
 * Falls back to Ext.panel.Panel if the host runtime does not expose
 * Pilot.utils.LeftBarPanel (older builds).
 */

(function () {
    var ParentClass = Ext.ClassManager.get('Pilot.utils.LeftBarPanel') ?
        'Pilot.utils.LeftBarPanel' :
        'Ext.panel.Panel';

    Ext.define('Store.temp_humidity_report.Tab', {
        extend: ParentClass,
        xtype: 'store-temp-humidity-report-tab',
        cls: 'thr-nav tab_clipped leftbarpanel',
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
         * (see communal/Tree.js for the canonical cascadeBy pattern).
         * If that store is not populated yet we listen for its load event,
         * and fall back to /ax/tree.php when the online tree is not available.
         */
        loadVehicles: function () {
            var me = this;
            var grid = me.down('#vehGrid');

            if (grid) {
                grid.setLoading(l('Loading vehicles...'));
            }

            var online = skeleton.navigation.online;
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
})();
