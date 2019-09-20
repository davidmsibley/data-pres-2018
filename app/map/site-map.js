import { filterLookup } from '../site-data.js';
import { RestylingCircleMarker } from './restyling-circle-marker.js';

export class SiteMap extends window.L.Evented {
  constructor() {
    super();
    this.selected = false;
    this._highlight = null;

    /* ~~~~~~~~ Map ~~~~~~~~ */
    //create a map, center it, and set the zoom level. 
    //set zoomcontrol to false because we will add it in a different corner. 
    this.map = L.map('map', {zoomControl:false}).setView([44.25, -89.9], 7);
    this.el = document.querySelector('#map');
     
     /* ~~~~~~~~ Zoom Control ~~~~~~~~ */
    //place a zoom control in the top right: 
    new L.Control.Zoom({position: 'topright'}).addTo(this.map);

     
    /* ~~~~~~~~ Basemap Layers ~~~~~~~~ */
     
    // // basemaps from Open Street Map
    // const osmhot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    //   attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors', 
    //   label: "OpenStreetMap Humanitarian"
    // });

    // // CARTO Positron
    // const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    //   attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    //   label: 'CARTO Positron'
    // });

    // CARTO Voyager
    const voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
      label: 'CARTO Voyager'
    });

    // Esri basemaps 
    const esrisat = L.esri.basemapLayer('Imagery', {label: "Esri Satellite"});
    
    // add the basemap control to the map  
    var basemaps = [voyager, esrisat]; 
    basemaps[0].addTo(this.map);
    this.map.addControl(L.control.basemaps({
       basemaps: basemaps, 
       tileX: 0, 
       tileY: 0, 
       tileZ: 1
    })); 

    this.sources = filterLookup.reduce((result, curr) => {
      if (curr.source && curr.source.geojson) {
        result.push(
          window.fetch(curr.source.geojson,{
            cache: 'no-store'
          })
          .then((res) => {
            return res.json()
          }, reason => {
            console.log(reason)
          })
          .then((geojson)=>({
            name: curr[curr.prop],
            color: curr.color,
            data: geojson}), reason => {
              console.log(reason)
            }))
      }
      return result;
    }, []);
  }

  init() {
    const map = this.map;
    return Promise.all(this.sources).then((responses) => {
      this.layers = responses.map((res) => {
        return L.geoJSON(res.data, {
          name: res.name,
          pointToLayer: function(geoJsonPoint, latlon) {
            return new RestylingCircleMarker(latlon, {
              weight: 2,
              color: res.color,
              radius: RestylingCircleMarker.calcRadius(map.getZoom()),
              stroke: false,
              fill: false
            });
          }
        });
      });
      this.layers.forEach(l => l.on('click', (e) => {
        if (this._highlight !== e.propagatedFrom) {
          this.fire('interaction', e.propagatedFrom.feature.properties);
        } else {
          this.fire('interaction');
        }
      }))
      this.layers.forEach(l => l.addTo(this.map));
      let lookup = {};
      this.layers.forEach(function(layer, idx, arr) {
        layer.eachLayer(function(obj) {
          let wid = obj.feature.properties['Wid'] || obj.feature.properties['WGNHS_ID'];
          let siteCode = SiteMap.getSiteCode(obj.feature.properties);
          let siteName = obj.feature.properties['Site_Name'] || obj.feature.properties['SiteName'];
          let latLon = obj.getLatLng();
          let cache = lookup[siteCode] || {
            'Site_Code': siteCode,
            'Site_Name': siteName,
            'Wid': wid,
            'Latitude': latLon['lat'].toFixed(6),
            'Longitude': latLon['lng'].toFixed(6),
            point: obj,
            datas: new Array(arr.length)
          };
          obj.feature.properties['Site_Code'] = siteCode;
          obj.feature.properties['Site_Name'] = siteName;
          obj.feature.properties['Data_Type'] = layer.options.name;

          cache.datas[idx] = obj.feature.properties;
          lookup[siteCode] = cache;
        });
      });
      this._lookup = lookup;
    }, reason => console.log(reason));
  }

  static getSiteCode(params) {
    let keys = ['Wid', 'WGNHS_ID', 'ID', 'Site_Code'];
    let result = keys.reduce((prev, curr) => {
      return prev || params[curr];
    }, undefined)
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
      this._highlight.bringToFront()
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