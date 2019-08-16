(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('lit-element'), require('wgnhs-common'), require('@uirouter/core'), require('wgnhs-viz'), require('wgnhs-interact'), require('wgnhs-layout')) :
  typeof define === 'function' && define.amd ? define(['exports', 'lit-element', 'wgnhs-common', '@uirouter/core', 'wgnhs-viz', 'wgnhs-interact', 'wgnhs-layout'], factory) :
  (global = global || self, factory(global.app = {}, global.common, global.common, global.common, global.lit, global.lit, global.lit));
}(this, function (exports, litElement, wgnhsCommon, core, wgnhsViz, wgnhsInteract, wgnhsLayout) { 'use strict';

  const RestylingCircleMarker = L.CircleMarker.extend({
    getEvents: function() {
      return {
        zoomend: this._restyle,
        filterpoints: this._filter
      }
    }, 
    _restyle: function(e){
      this.setRadius(RestylingCircleMarker.calcRadius(e.target.getZoom()));
    },
    _filter: function(e) {
      let isDisplayable = e.detail.resolve(this.feature.properties);
      if (isDisplayable) {
        this.setStyle({
          stroke: true,
          fill: true
        });
      } else {
        this.setStyle({
          stroke: false,
          fill: false
        });
      }
    },
    highlight: function() {
      this._activeBackup = {
        color: this.options.color,
        stroke: this.options.stroke,
        fill: this.options.fill
      };
      this.setStyle({
        color: 'var(--palette-active)',
        stroke: true,
        fill: true
      });
    },
    removeHighlight: function() {
      if (this._activeBackup) {
        this.setStyle(this._activeBackup);
        this._activeBackup = null;
      }
    }
  });

  RestylingCircleMarker.calcRadius = (a) => Math.max(a/1.5,3);

  class SiteMap extends window.L.Evented {
    constructor() {
      super();
      this.selected = false;
      this._highlight = null;

      /* ~~~~~~~~ Map ~~~~~~~~ */
      //create a map, center it, and set the zoom level. 
      //set zoomcontrol to false because we will add it in a different corner. 
      const map = this.map = L.map('map', {zoomControl:false}).setView([45, -89.623861], 7);
      this.el = document.querySelector('#map');
       
       /* ~~~~~~~~ Zoom Control ~~~~~~~~ */
      //place a zoom control in the top right: 
      new L.Control.Zoom({position: 'topright'}).addTo(map);

       
      /* ~~~~~~~~ Basemap Layers ~~~~~~~~ */
       
      // basemaps from Open Street Map
      const osmhot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors', 
        label: "OpenStreetMap Humanitarian"
      }).addTo(map);

      // Esri basemaps 
      const esrisat = L.esri.basemapLayer('Imagery', {label: "Esri Satellite"});
      
      // add the basemap control to the map  
      var basemaps = [osmhot, esrisat]; 
      map.addControl(L.control.basemaps({
         basemaps: basemaps, 
         tileX: 0, 
         tileY: 0, 
         tileZ: 1
      })); 

      /* +++++++++++ Borehole Geophysical Logs layer +++++++++++ */ 
      let bore = this.bore = L.esri.featureLayer({
        name: 'Geophysical Log Data',
        url: "https://data.wgnhs.wisc.edu/arcgis/rest/services/geologic_data/borehole_geophysics/MapServer/0",
        pointToLayer: function(geoJsonPoint, latlon) {
          return new RestylingCircleMarker(latlon, {
            weight: 2,
            color: 'var(--palette-blue)',
            radius: RestylingCircleMarker.calcRadius(map.getZoom()),
            stroke: false,
            fill: false
          });
        }
      }).on('click', (function(e) {
        if (this._highlight !== e.propagatedFrom) {
          this.fire('interaction', e.propagatedFrom.feature.properties);
        } else {
          this.fire('interaction');
        }
      }).bind(this));

      /* +++++++++++ Sediment Core layer +++++++++++ */ 
      let quat = this.quat = L.esri.featureLayer({
        name: 'Quaternary Core Data',
        url: "https://data.wgnhs.wisc.edu/arcgis/rest/services/geologic_data/sediment_core/MapServer/0",
        pointToLayer: function(geoJsonPoint, latlon) {
          return new RestylingCircleMarker(latlon, {
            weight: 2,
            color: 'var(--palette-green)',
            radius: RestylingCircleMarker.calcRadius(map.getZoom()),
            stroke: false,
            fill: false
          });
        }
      }).on('click', (function(e) {
        if (this._highlight !== e.propagatedFrom) {
          this.fire('interaction', e.propagatedFrom.feature.properties);
        } else {
          this.fire('interaction');
        }
      }).bind(this));

      this.layers = [bore, quat];

      Promise.all([new Promise(function(resolve, reject) {
        bore.once('load', (function() {
          resolve();
        }));
      }),new Promise(function(resolve, reject) {
        quat.once('load', (function() {
          resolve();
        }));
      })]).then(() => {
        let lookup = {};
        this.layers.forEach(function(layer, idx, arr) {
          layer.eachFeature(function(obj) {
            let wid = obj.feature.properties['Wid'];
            let siteCode = SiteMap.getSiteCode(obj.feature.properties);
            let siteName = obj.feature.properties['Site_Name'] || obj.feature.properties['SiteName'];
            let latLon = obj.getLatLng();
            let cache = lookup[siteCode] || {
              'Site_Code': siteCode,
              'Site_Name': siteName,
              'Wid': wid,
              'Latitude': latLon['lat'],
              'Longitude': latLon['lng'],
              point: obj,
              datas: new Array(arr.length)
            };
            obj.feature.properties['Site_Code'] = siteCode;
            obj.feature.properties['Data_Type'] = layer.options.name;

            cache.datas[idx] = obj.feature.properties;
            lookup[siteCode] = cache;
          });
        });
        this._lookup = lookup;
        this.fire('init');
      });

      bore.addTo(map);
      quat.addTo(map);
    }

    static getSiteCode(params) {
      let keys = ['Wid', 'ID', 'Site_Code'];
      let result = keys.reduce((prev, curr) => {
        return prev || params[curr];
      }, undefined);
      return result;
    }

    //TODO HACK
    getPoint(params) {
      let result = null;
      let cache = this._lookup[SiteMap.getSiteCode(params)];
      if (cache) {
        result = cache.point;
      }
      return result;
    }

    getSite(params) {
      let result = this._lookup[SiteMap.getSiteCode(params)];
      return result;
    }

    zoomToPoint(site) {
      let point = this.getPoint(site);
      if (point) {
        this.map.setZoomAround(point.getLatLng(), 15);
      }
    }

    getHighlightPoint() {
      // console.log('retrieve highlight point');
      let result = this._highlight;
      return result;
    }

    setHighlightPoint(point) {
      if (point) {
        // console.log('set highlight point');
        this._highlight = point;
        this._highlight.bringToFront();
        this._highlight.highlight();
      } else {
        this.clearSelection();
      }
    }

    selectPoint(params) {
      let result = null;
      // console.log('select point on map:', site);
      let point = this.getPoint(params);
      if (point) {
        result = point.feature.properties;
        let highlightPoint = this.getHighlightPoint();
        if (point !== highlightPoint) {
          this.clearSelection();
          this.setHighlightPoint(point);
        }
      }
      return result;
    }

    selectSite(params) {
      let result = this.getSite(params);
      this.selectPoint(params);
      return result;
    }

    clearSelection() {
      // console.log('clear highlight group');
      if (this._highlight) {
        this._highlight.bringToBack();
        this._highlight.removeHighlight();
      }
      this._highlight = null;
    }

    updatePoints(activePoints) {
      this.map.fire('filterpoints', {
        detail: {
          resolve: (props) => {
            return activePoints.reduce((prev, activeSet) => {
              const code = SiteMap.getSiteCode(props);
              const has = activeSet.has('' + code);
              const result = prev || has;
              return result;
            }, false);
          }
        }
      });
    }

    setVisibility(isVisible) {
      if (isVisible) {
        this.el.removeAttribute('data-closed');
        this.map.invalidateSize();
      } else {
        this.el.setAttribute('data-closed', true);
      }
    }

  }

  class FilterGroup {
    constructor(config) {
      Object.assign(this, config);
      if (!this.id) {
        this.id = wgnhsCommon.genId();
      }
    }
    activate(context) {
      let result = null;
      const input = context.detail.checked;
      if (context.toggleable && input) {
        result = {
          id: context.id,
          resolve: function(feature) {
            return feature[context.prop] === context.value;
          }
        };
      }
      return result;
    }
  }

  class CheckboxControl {
    constructor() {
      this.id = wgnhsCommon.genId();
    }
    get next() {
      return litElement.html`
      <input type="checkbox">
    `;
    }
    handle(context) {
      let result = null;

      let input = context.target.nextElementSibling.checked;
      // blank selects all, apply filter if non-blank
      if (input) {
        result = {
          id: context.id,
          resolveGroup: function(feature) {
            return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
          },
          resolve: function(feature) {
            // filter out features without the property
            let isValid = !!feature[context.prop];
            return isValid;
          }
        };
      }
      return result;
    }
  }

  class GTLTControl {
    constructor(isDate) {
      this.id = wgnhsCommon.genId();
      this.gtName = (isDate)?'after':'at least';
      this.ltName = (isDate)?'before':'less than';
    }
    get next() {
      return litElement.html`
      <select>
        <option value="gt">${this.gtName}</option>
        <option value="lt">${this.ltName}</option>
      </select>
      <input type="text">
    `;
    }
    handle(context) {
      let result = null;
      context['gt'] = (a, b) => (a >= b);
      context['lt'] = (a, b) => (a < b);

      const predicate = context[context.target.nextElementSibling.value];
      const input = context.target.nextElementSibling.nextElementSibling.value;
      // blank selects all, apply filter if non-blank
      if (input) {
        result = {
          id: context.id,
          resolveGroup: function(feature) {
            return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
          },
          resolve: function(feature) {
            // filter out features without the property
            let isValid = !!feature[context.prop];
            if (isValid) {
              isValid = predicate(feature[context.prop], input);
            }
            return isValid;
          }
        };
      }
      return result;
    }
  }

  class SelectControl {
    constructor() {
      this.id = wgnhsCommon.genId();
    }
    get next() {
      return litElement.html`
      <select ?disabled="${!this.options}">
        <option></option>
        ${(!this.options)?'':this.options.map((el) => litElement.html`
        <option value="${el}">${el}</option>
        `)}
      </select>
    `;
    }
    init(uniques) {
      if (!this.options) {
        this.options = Array.from(uniques).sort();
      }
    }
    handle(context) {
      let result = null;

      const input = context.target.nextElementSibling.value;
      // blank selects all, apply filter if non-blank
      if (input) {
        result = {
          id: context.id,
          resolveGroup: function(feature) {
            return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
          },
          resolve: function(feature) {
            // filter out features without the property
            let isValid = !!feature[context.prop];
            if (isValid) {
              const value = feature[context.prop];
              isValid = value === input;
            }
            return isValid;
          }
        };
      }
      return result;
    }
  }

  class TextControl {
    constructor() {
      this.id = wgnhsCommon.genId();
    }
    get next() {
      return litElement.html`
      <input type="text">
    `;
    }
    handle(context) {
      let result = null;

      const input = ('' + context.target.nextElementSibling.value).trim().toUpperCase();
      // blank selects all, apply filter if non-blank
      if (input) {
        result = {
          id: context.id,
          resolveGroup: function(feature) {
            return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
          },
          resolve: function(feature) {
            // filter out features without the property
            let isValid = !!feature[context.prop];
            if (isValid) {
              const value = ('' + feature[context.prop]).trim().toUpperCase();
              isValid = value === input;
            }
            return isValid;
          }
        };
      }
      return result;
    }
  }

  class ContainsControl {
    constructor() {
      this.id = wgnhsCommon.genId();
    }
    get next() {
      return litElement.html`
      <input type="text">
    `;
    }
    handle(context) {
      let result = null;

      const input = ('' + context.target.nextElementSibling.value).trim().toUpperCase();
      // blank selects all, apply filter if non-blank
      if (input) {
        result = {
          id: context.id,
          resolveGroup: function(feature) {
            return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
          },
          resolve: function(feature) {
            // filter out features without the property
            let isValid = !!feature[context.prop];
            if (isValid) {
              const value = ('' + feature[context.prop]).trim().toUpperCase();
              isValid = value.includes(input);
            }
            return isValid;
          }
        };
      }
      return result;
    }
  }

  class SiteData {
    constructor(layers) {

      // Define aggregated data for visualization
      this._aggrKeys = [
        'County',
        'Drill_Meth'
      ];
      this.aggrData = [];
      for (let l of layers) {
        this.aggrData.push(SiteData._gatherAggrData(l, this._aggrKeys));
      }

      this.datas = this.aggrData.map((el)=>el.data).reduce((prev, curr)=>prev.concat(curr),[]);
      this.uniques = {};
      this._aggrKeys.forEach((key) => this.uniques[key] = new Set(this.datas.map((el)=>el[key]).filter((el)=>!!el)));
    }

    static _gatherAggrData(layer, aggrKeys) {
      const aggrData = {
        aggr: {},
        data: []
      };

      // Collect datasets and aggregates
      layer.eachFeature(function(obj, l) {
        let result = {};
        aggrKeys.forEach(function(key) {
          result[key] = obj.feature.properties[key];
          if (!aggrData.aggr[key]) {
            aggrData.aggr[key] = {};
          }
          let group = aggrData.aggr[key];
          if (result[key] && 'number' === typeof result[key]) {
            if (!group.max || group.max < result[key]) {
              group.max = result[key];
            }
            if (!group.min || group.min > result[key]) {
              group.min = result[key];
            }
          }
        });
        aggrData.data.push(result);
      });

      return aggrData;
    }
  }

  const ignoredKeys = [
    'Site_Code',
    'Data_Type',
    'SiteName',
    'Site_Name',
    'Wid',
    'ID',
    'County'
  ];
  const keyLookup = {
    'SiteName': {title: 'Site Name', desc: ''},
    'Site_Name': {title: 'Site Name', desc: ''},
    'Wid': {title: 'WID', desc: ''},
    'ID': {title: 'ID', desc: ''},
    'RecentLog': {title: 'Most recent log (year)', desc: ''},
    'MaxDepth': {title: 'Max depth (ft)', desc: ''},
    'Norm_Res': {title: 'Normal Resistivity', desc: ''},
    'Caliper': {title: 'Caliper', desc: ''},
    'Gamma': {title: 'Natural Gamma', desc: ''},
    'SP': {title: 'Spontaneous (Self) Potential', desc: ''},
    'SPR': {title: 'Single Point Resistivity', desc: ''},
    'Spec_Gamma': {title: 'Spectral Gamma', desc: ''},
    'Fluid_Cond': {title: 'Fluid Conductivity', desc: ''},
    'Flow_Spin': {title: 'Spinner Flow Meter', desc: ''},
    'Fluid_Temp': {title: 'Fluid Temperature', desc: ''},
    'Fluid_Res': {title: 'Fluid Resistivity', desc: ''},
    'OBI': {title: 'Optical Borehole Image (OBI)', desc: ''},
    'ABI': {title: 'Acoustic Borehole Image (ABI)', desc: ''},
    'Video': {title: 'Video', desc: ''},
    'Drill_Year': {title: 'Drill year', desc: ''},
    'Depth_Ft': {title: 'Depth (ft)', desc: ''},
    'Drill_Meth': {title: 'Drill Method', desc: ''},
    'Subsamples': {title: 'Subsamples', desc: ''},
    'Photos': {title: 'Core Photos', desc: ''},
    'Grainsize': {title: 'Grainsize', desc: ''},
  };

  const filterLookup = [
    new FilterGroup({
      title: "Site Information",
      open: true,
      sections: [
        {
          fields: {
            "County": {
              controls: [
                new SelectControl()
              ]
            },
            // "SiteName": {
            //   controls: [
            //     new ContainsControl()
            //   ]
            // },
            "Site_Name": {
              controls: [
                new ContainsControl()
              ]
            },
            "Wid": {
              controls: [
                new TextControl()
              ]
            },
          }
        }
      ]
    }),
    new FilterGroup({
      title: "Geophysical Log Data",
      prop: 'Data_Type',
      'Data_Type': 'Geophysical Log Data',
      toggleable: true,
      active: true,
      sections: [
        {
          fields: {
            "RecentLog": {
              controls: [
                new GTLTControl(true)
              ]
            },
            "MaxDepth": {
              controls: [
                new GTLTControl()
              ]
            }
          }
        },
        {
          title: "Geologic",
          fields: {
            "Norm_Res": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Caliper": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Gamma": {
              controls: [
                new CheckboxControl()
              ]
            },
            "SP": {
              controls: [
                new CheckboxControl()
              ]
            },
            "SPR": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Spec_Gamma": {
              controls: [
                new CheckboxControl()
              ]
            },

          }
        },
        {
          title: "Hydrogeologic",
          fields: {
            "Fluid_Cond": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Flow_Spin": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Fluid_Temp": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Fluid_Res": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Flow_HP": {
              controls: [
                new CheckboxControl()
              ]
            },

          }
        },
        {
          title: "Image",
          fields: {
            "OBI": {
              controls: [
                new CheckboxControl()
              ]
            },
            "ABI": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Video": {
              controls: [
                new CheckboxControl()
              ]
            },

          }
        }
      ]
    }),
    new FilterGroup({
      title: "Quaternary Core Data",
      prop: 'Data_Type',
      'Data_Type': 'Quaternary Core Data',
      toggleable: true,
      active: true,
      sections: [
        {
          fields: {
            "Drill_Year": {
              controls: [
                new GTLTControl(true)
              ]
            },
            "Depth_Ft": {
              controls: [
                new GTLTControl()
              ]
            },
            "Drill_Meth": {
              controls: [
                new SelectControl()
              ]
            },
          }
        },
        {
          title: "Analyses available",
          fields: {
            "Subsamples": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Photos": {
              controls: [
                new CheckboxControl()
              ]
            },
            "Grainsize": {
              controls: [
                new CheckboxControl()
              ]
            }
          }
        }
      ]
    })
  ];

  const DEFAULT_ROUTE = 'entry';

  class SiteRouter extends window.L.Evented {

    constructor() {
      super();
      this.router = new core.UIRouter();
      this.router.plugin(core.pushStateLocationPlugin);
      this.router.plugin(core.servicesPlugin);
      this.routes = {};
    }

    start() {
      this.router.urlService.rules.initial({ state: DEFAULT_ROUTE });
      this.router.urlService.rules.otherwise({ state: DEFAULT_ROUTE });
      // this.router.trace.enable(1);
      this.router.urlService.listen();
      this.router.urlService.sync();
    }

    addRoute(config) {
      if (config && config.name) {
        this.routes[config.name] = config;
        this.router.stateRegistry.register(config);
      }
    }

    /**
     * clear selection
     */
    clearRoute() {
      this.setRoute();
    }

    setRoute(name, params) {
      if (arguments.length > 0 && this.routes[name]) {
        this.router.stateService.go(name, params);
      } else {
        this.router.stateService.go(DEFAULT_ROUTE);
      }
    }

    link(name, params) {
      let result = '';
      if (params) {
        result = this.router.stateService.href(name, params);
      } else {
        result = this.router.stateService.href(name);
      }
      return result;
    }

  }

  class TableLayout extends litElement.LitElement {

    static get layoutName() {
      return undefined;
    }

    static include(info, context) {
      return litElement.html`<table-layout .info=${info} .context=${context}></table-layout>`;
    }

    static get properties() {
      return {
        info: {
          type: Object
        },
        context: {
          type: Object
        }
      };
    }

    constructor() {
      super();
    }

    static get styles() {
      return litElement.css`
      [data-element="table"] {
        display: grid;
        grid-template-columns: 40% 1fr;
        grid-gap: var(--border-radius);
        margin: 0 var(--border-radius);
      }
      .label {
        font-weight: var(--font-weight-bold);
      }
    `;
    }

    render() {
      let key = 0, value = 1;
      let entries = Object.entries(this.info).filter((el) => {
        return !ignoredKeys.includes(el[key]);
      }).map((el, index) => litElement.html`
      <td class="label" title="${(keyLookup[el[key]])?keyLookup[el[key]].desc:el[key]}">
        <label for="${this.context.genId(index)}" >
          ${(keyLookup[el[key]])?keyLookup[el[key]].title:el[key]}
        </label>
      </td>
      <td class="detail" title="${(keyLookup[el[key]])?keyLookup[el[key]].desc:el[key]}">
        <span id="${this.context.genId(index)}">
          ${el[value]}
        </span>
      </td>
    `);
      return litElement.html`
      <div data-element="table">
        ${entries}
      </div>
    `;
    }
  }
  customElements.define('table-layout', TableLayout);

  class LogLayout extends litElement.LitElement {
    static get layoutName() {
      return 'Geophysical Log Data';
    }

    static include(info, context) {
      return litElement.html`<log-layout .info=${info} .context=${context}></log-layout>`;
    }

    static get properties() {
      return {
        info: {
          type: Object
        },
        context: {
          type: Object
        }
      };
    }

    constructor() {
      super();
    }

    static get styles() {
      return litElement.css`
    `;
    }

    render() {
      return litElement.html`
    <table-layout .info=${this.info} .context=${this.context}></table-layout>
    <pdf-view-button
      .panel=${this.context.pdfpanel}
      src="${'https://data.wgnhs.wisc.edu/geophysical-logs/' + this.info.Wid + '.pdf'}">
    </pdf-view-button>
    `;
    }
  }
  customElements.define('log-layout', LogLayout);

  class CoreLayout extends litElement.LitElement {
    static get layoutName() {
      return 'Quaternary Core Data';
    }

    static include(info, context) {
      return litElement.html`<table-layout .info=${info} .context=${context}></table-layout>`;
    }

    static get properties() {
      return {
        info: {
          type: Object
        },
        context: {
          type: Object
        }
      };
    }

    constructor() {
      super();
    }

    static get styles() {
      return litElement.css`
    `;
    }
    render() {
      return litElement.html``;
    }
  }
  customElements.define('core-layout', CoreLayout);

  const defaultLayout = TableLayout;
  const availableLayouts = [
    defaultLayout,
    LogLayout,
    CoreLayout
  ];

  const layoutResolver = {
    getLayout: function getLayout(layoutName) {
      let layout = availableLayouts.find((el) => {
        return el.layoutName === layoutName;
      });
      if (!layout) {
        layout = defaultLayout;
      }
      return layout.include;
    }
  };

  class SiteDetails extends litElement.LitElement {
    static get properties() {
      return {
        siteinfo: {
          type: Object
        },
        pdfpanel: {
          type: Object
        }
      };
    }

    constructor() {
      super();
      this.genId = (function() {
        const memo = {};
        return function(index) {
          if (!memo[index]) {
            memo[index] = wgnhsCommon.genId();
          }
          return memo[index];
        }
      })();
    }

    static get styles() {
      return litElement.css`
      .header {
        position: -webkit-sticky;
        position: sticky;
        top: 0px;
        background-color: var(--palette-white);
        padding: var(--font-size-extra-large) var(--border-radius);
        z-index: 10;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        justify-content: space-between;
      }
      .header h1 {
        padding: 0;
        max-width: 70%;
        text-align: center;
      }
      .header i {
        font-size: var(--icon-size-large);
        color: var(--palette-accent);
        cursor: pointer;
      }
      
      [data-closed] {
        display: none;
      }
    `;
    }

    renderData(info, layoutName) {
      const layout = layoutResolver.getLayout(layoutName);
      return layout(info, this);
    }

    render() {
      let Latitude = (this.siteinfo)?this.siteinfo['Latitude']:null;
      let Longitude = (this.siteinfo)?this.siteinfo['Longitude']:null;
      let WID = (this.siteinfo)?this.siteinfo['Wid']:null;
      return litElement.html`
      <style>
        @import url("./css/typography.css");
      </style>

      ${(!this.siteinfo)? '' : litElement.html`
        <div class="header">
          <span>
            <a href="${window.router.link('entry')}" onclick="event.preventDefault()"><i class="material-icons clear-selection" title="Clear selection" @click="${this.fireClearSelection}" >arrow_back</i></a>
          </span>
          <h1>${this.siteinfo.Site_Name}</h1>
          <span></span>
        </div>
        ${this.renderData({
          Latitude, Longitude, WID
        })}
        <h2>Data Available:</h2>
        ${this.siteinfo.datas.map((props) => litElement.html`
          <app-collapsible open>
            <span slot="header">${props['Data_Type']}</span>
            <div slot="content">
              ${this.renderData(props, props['Data_Type'])}
            </div>
          </app-collapsible>
        `)}
      `}
    `;
    }

    fireClearSelection() {
      let event = new CustomEvent('clear-selection', {
        bubbles: true,
        detail: {}
      });
      this.dispatchEvent(event);
    }
  }
  customElements.define('site-details', SiteDetails);

  class FilterSummary extends litElement.LitElement {
    static get properties() {
      return {
        counts: {
          type: Array
        }
      };
    }

    constructor() {
      super();
    }

    static get styles() {
      return litElement.css`
    `;
    }

    render() {
      return (!this.counts)?litElement.html``:litElement.html`
    <div>
      <span>Showing:</span>
      <ul>
        <li>
          <span>
          ${this.counts.reduce((prev, count) => (count.current + prev), 0)}
          </span> of <span>
          ${this.counts.reduce((prev, count) => (count.total + prev), 0)}
          </span> total sites
        </li>
        ${this.counts.map((el) => litElement.html`
        <li>
          <span>${el.current}</span> of <span>${el.total}</span> sites having <span>${el.name}</span>
        </li>
        `)}
      </ul>
    </div>
    `;
    }

    setCounts(counts) {
      this.counts = counts;
    }
  }
  customElements.define('filter-summary', FilterSummary);

  class MapFilter extends litElement.LitElement {
    static get properties() {
      return {
        include: {
          type: Array,
          attribute: false
        },
        filter: {
          type: Array,
          attribute: false
        },
        matchClass: {
          type: String,
          attribute: false
        },
        sources: {
          type: Array,
          attribute: false
        }
      };
    }

    static get styles() {
      return litElement.css`
      .field {
        display: grid;
        grid-template-columns: 40% 1fr;
        grid-gap: var(--border-radius);
        margin: 0 var(--border-radius);
      }

      .label {
        font-weight: var(--font-weight-bold);
      }

      .selector {
      }

      .section-title {
        margin: var(--line-height) 0 0 0;
        padding: var(--border-radius);
        background-color: var(--palette-light);
      }

      in-radio {
        display: inline-grid;
        grid-template-columns: auto auto;
      }
    `;
    }

    updateMatchClass(e) {
      this.matchClass = e.target.choice;
    }

    render() {
      return litElement.html`
      <style>
        @import url("./css/typography.css");
      </style>
      <div>
        <filter-summary></filter-summary>
      </div>
      <div>
        Show sites that have <in-radio choices='["ALL", "ANY"]' @choice-change="${this.updateMatchClass}"></in-radio> of the following:
      </div>
      <div>
        ${this.renderFilterGroups()}
      </div>
    `;
    }

    resolveKeyLookup(field) {
      let result = (!keyLookup[field])?field:keyLookup[field].title;
      return result;
    }

    renderFilterGroups() {
      let name=0, config=1;
      return this.filterGroups.map((group) => litElement.html`
      <app-collapsible
        ?open=${group.open} @open=${this._handle(group)}>
        <i slot="header-before" class="material-icons">expand_more</i>
        <span slot="header">${group.title}</span>
        ${(!group.toggleable)?'':litElement.html`
          <toggle-switch
            name="${group.mapName}"
            slot="header-after"
            ?checked=${group.active}
            @change=${this._handleGroup(group, 'include')}
          ></toggle-switch>
        `}
        <div slot="content">
          ${group.sections.map((section, index) => litElement.html`
            ${!(section.title)?'':litElement.html`
              <h2 class="section-title">${section.title}</h2>
            `}
            ${Object.entries(section.fields).map((entry, index) => litElement.html`
              <div class="field">
              ${(entry[config].controls.length === 0)?'':entry[config].controls.map(control => litElement.html`
                <td class="label">
                  <label for="${this.genId(index)}" >
                    ${this.resolveKeyLookup(entry[name])}
                  </label>
                </td>
                <td class="selector" 
                    @change="${this._handleControl(group, control, 'filter')}">
                  <input
                    type="hidden"
                    id="${control.id}"
                    name="${entry[name]}">
                  ${control.next}
                </td>
              `)}
              </div>
            `)}
          `)}
        </div>
      </app-collapsible>
    `);
    }

    get _eventHandlers() {
      return {
        'open' : (context, e) => {
          context.open = e.detail.value;
        }
      }
    }

    _handle(context) {
      return (e) => {
        const handler = this._eventHandlers[e.type];
        if (handler) {
          handler(context, e);
          this.requestUpdate('handle_'+e.type);
        }
      }
    }

    _handleGroup(group, type) {
      const id = group.id;
      const handle = group.activate.bind(group);
      const filter = this[type];
      const callback = this.requestUpdate.bind(this);
      return (e) => {
        const context = {};
        context.id = id;
        context.toggleable = group.toggleable;
        context.detail = e.detail;
        context.prop = group.prop;
        context.value = group[group.prop];
        removeFromFilter(filter, id);
        let resolver = handle(context);
        if (resolver) {
          filter.push(resolver);
        }
        callback(type);
      }
    }

    _handleControl(group, control, type) {
      const id = control.id;
      const handle = control.handle.bind(control);
      const filter = this[type];
      const callback = this.requestUpdate.bind(this);
      return (e) => {
        const context = {};
        context.id = id;
        context.group = group;
        context.target = e.currentTarget.querySelector('#'+id);
        context.prop = context.target.name;
        removeFromFilter(filter, id);
        let resolver = handle(context);
        if (resolver) {
          filter.push(resolver);
        }
        callback(type);
      }
    }

    updated(changed) {
      const isNeeded = (
        changed.has('matchClass') ||
        changed.has('include') ||
        changed.has('filter') ||
        changed.has('sources'));

      if (this.sources && isNeeded) {
        const activePoints = MapFilter.runFilter({
          matchClass: this.matchClass,
          incl: this.include,
          filt: this.filter,
          sources: this.sources
        });
        this.$summary.setCounts(MapFilter.getResultsInfo(this.sources, activePoints));
        wgnhsCommon.dispatch(this, 'filtered', {activePoints});
      }
    }

    firstUpdated() {
      this.$summary = this.renderRoot.querySelector('filter-summary');
    }

    init(uniques, layers) {
      this.filterGroups.forEach((group) => {
        group.sections.forEach((section) => {
          Object.entries(section.fields).forEach((field) => {
            field[1].controls.forEach((control) => {
              if (control.init) {
                control.init(uniques[field[0]]);
              }
            });
          });
        });
      });

      this.sources = layers;
    }

    static runFilter({matchClass, incl, filt, sources}) {
      const resolve = function runPointThroughFilters(props) {
        let included = incl.length > 0 && incl.reduce((prev, curr) => {
          return prev || curr.resolve(props);
        }, false);
        let spec = filt.filter((rule) => rule.resolveGroup(props));
        let result = included && spec.length < 1;
        if (included && !result) {
          if ("ALL" === matchClass) {
            result = spec.reduce((prev, curr) => {
              return prev && curr.resolve(props);
            }, true);
          } else {
            result = spec.reduce((prev, curr) => {
              return prev || curr.resolve(props);
            }, false);
          }
        }
        return result;
      };

      const result = sources.map((layer) => {
        const activePoints = new Set();
        Object.entries(layer._layers).forEach((ent) => {
          if (resolve(ent[1].feature.properties)) {
            activePoints.add('' + ent[0]);
          }
        });
        return activePoints;
      });

      return result;
    }

    static getResultsInfo(sources, activePoints) {
      const result = sources.map((layer, i) => {
        let stats = {};
        stats.name = layer.options.name;

        let entries = Object.entries(layer._layers);
        stats.total = entries.length;
        stats.current = activePoints[i].size;

        return stats;
      });
      return result;
    }

    constructor() {
      super();
      this.genId = (function() {
        const memo = {};
        return function(index) {
          if (!memo[index]) {
            memo[index] = wgnhsCommon.genId();
          }
          return memo[index];
        }
      })();
      this.include = [];
      this.filter = [];
      this.filterGroups = filterLookup;
    }
  }
  customElements.define('map-filter', MapFilter);

  const removeFromFilter = (filter, id) => {
    for (
      var idx = filter.findIndex(el => el.id === id); 
      idx >= 0;
      idx = filter.findIndex(el => el.id === id)
    ) {
      filter.splice(idx, 1);
    }
  };

  window.siteMap = new SiteMap();
  window.sidebar = document.querySelector('#sidebar');
  window.pdfPanel = document.querySelector('#sketch');
  document.querySelectorAll('site-details').forEach(function(details) {
    details['pdfpanel'] = window.pdfPanel;
  });
  window.filter = document.querySelector('#filter');

  window.siteMap.once('init', function() {
    window.siteData = new SiteData(window.siteMap.layers);
    window.aggrData = siteData.aggrData;
    filter.init(window.siteData.uniques, window.siteMap.layers);

    var deselectFeature = function() {
      window.pdfPanel.hide();
      document.querySelectorAll('site-details').forEach(function(details) {
        details['siteinfo'] = null;
      });
    };

    async function selectFeature(info) {
      deselectFeature();
      document.querySelectorAll('site-details').forEach(function(details) {
        details['siteinfo'] = info;
      });
      return true;
    }
    window.router = new SiteRouter();
    window.router.addRoute({
      name: 'entry',
      url: '/',
      onEnter: function(trans, state) {
        // console.log('route-entry');
        window.siteMap.clearSelection();
        deselectFeature();
        document.querySelector('#app').setAttribute('data-view', 'app');
        window.sidebar.switchTab('default');
        window.siteMap.setVisibility(true);
      },
      onExit: function(trans, state) {

      },
    });
    window.router.addRoute({
      name: 'view',
      url: '/view/:Site_Code',
      // params: {
      //   'Site_Code': {
      //     array: true
      //   }
      // },
      onEnter: function(trans, state) {
        // console.log('route-view');
        let params = trans.params();
        let attr = window.siteMap.selectSite(params);
        if (attr) {
          document.querySelectorAll('site-details').forEach(function(details) {
            details['printLayout'] = false;
          });
          selectFeature(attr).then(() => {
            document.querySelector('#app').setAttribute('data-view', 'app');
            window.sidebar.switchTab('details');
            window.siteMap.setVisibility(true);
          });
        } else {
          window.router.clearRoute();
        }
      },
      onExit: function(trans, state) {

      },
    });
    window.router.addRoute({
      name: 'print',
      url: '/print/:Site_Code',
      // params: {
      //   'Site_Code': {
      //     array: true
      //   }
      // },
      onEnter: function(trans, state) {
        // console.log('route-print');
        let params = trans.params();
        let attr = window.siteMap.selectSite(params);
        if (attr) {
          document.querySelectorAll('site-details').forEach(function(details) {
            details['printLayout'] = true;
          });
          selectFeature(attr).then(() => {
            document.querySelector('#app').removeAttribute('data-view');
            window.sidebar.switchTab('details');
            window.siteMap.setVisibility(false);
          });
        } else {
          window.router.clearRoute();
        }
      },
      onExit: function(trans, state) {

      },
    });
    window.router.router.transitionService.onEnter({}, ()=>{
      document.querySelector('#spinner').setAttribute('data-closed', true);
    });
    // Start the router
    window.router.start();

    window.siteMap.on('interaction', (params) => {
      if (params['Site_Code']) {
        window.router.setRoute('view', params);
      } else {
        window.router.clearRoute();
      }
    });
  });

  document.addEventListener('clear-selection', function(e) {
    window.router.clearRoute();
  });

  document.addEventListener('toggle-print', function(e) {
    if (e.detail.on) {
      window.router.setRoute('print', e.detail.params);
    } else {
      window.router.setRoute('view', e.detail.params);
    }
  });

  document.addEventListener('toggle-pdf-panel', function(e) {
    window.siteMap.setVisibility(e.detail.closed);
  });

  window.filter.addEventListener('filtered', function(e) {
    window.siteMap.updatePoints(e.detail.activePoints);
  });

  exports.MapFilter = MapFilter;
  exports.SiteDetails = SiteDetails;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
