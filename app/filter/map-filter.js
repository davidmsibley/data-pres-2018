import { LitElement, html, css } from 'lit-element';
import { genId, dispatch } from 'wgnhs-common';
export { InRadio, ToggleSwitch } from 'wgnhs-interact';
export { AppCollapsible } from 'wgnhs-layout';
export { FilterSummary } from './filter-summary.js';
import { keyLookup, filterLookup } from '../site-data.js';
import { SiteMap } from '../map/site-map.js';

export class MapFilter extends LitElement {
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
    return css`
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
    return html`
      <style>
        @import url("./css/typography.css");
      </style>
      <div>
        Show sites that have <in-radio choices='["ALL", "ANY"]' @choice-change="${this.updateMatchClass}"></in-radio> of the following:
      </div>
      <div>
        ${this.renderFilterGroups()}
      </div>
      <div>
        <filter-summary></filter-summary>
      </div>
    `;
  }

  resolveKeyLookup(field) {
    let result = (!keyLookup[field])?field:keyLookup[field].title;
    return result;
  }

  renderFilterGroups() {
    let name=0, config=1;
    return this.filterGroups.map((group) => html`
      <app-collapsible
        ?open=${group.open} @open=${this._handle(group)}>
        <i slot="header-before" class="material-icons">expand_more</i>
        <span slot="header">${group.title}</span>
        ${(!group.toggleable)?'':html`
          <toggle-switch
            name="${group.title}"
            slot="header-after"
            ?checked=${group.active}
            @change=${this._handleGroup(group, 'include')}
            style="--palette-active: ${group.color}"
          ></toggle-switch>
        `}
        <div slot="content">
          ${group.sections.map((section, index) => html`
            ${!(section.title)?'':html`
              <h2 class="section-title">${section.title}</h2>
            `}
            ${Object.entries(section.fields).map((entry, index) => html`
              <div class="field">
              ${(entry[config].controls.length === 0)?'':entry[config].controls.map(control => html`
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
      dispatch(this, 'filtered', {activePoints});
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
          })
        })
      })
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
    }

    const result = sources.map((layer) => {
      const activePoints = new Set();
      Object.entries(layer._layers).forEach((ent) => {
        if (resolve(ent[1].feature.properties)) {
          activePoints.add('' + SiteMap.getSiteCode(ent[1].feature.properties));
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
          memo[index] = genId();
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
}
