import { html } from 'lit-element';
import { genId } from 'wgnhs-common';

export class FilterGroup {
  constructor(config) {
    Object.assign(this, config);
    if (!this.id) {
      this.id = genId();
    }
  }
  activate(context) {
    let result = null;
    const input = context.detail.checked;
    if (context.toggleable && input) {
      result = {
        id: context.id,
        context,
        resolve: function(feature) {
          return feature[context.prop] === context.value;
        }
      };
    }
    return result;
  }
}

export class CheckboxControl {
  constructor() {
    this.id = genId();
  }
  get next() {
    return html`
      <toggle-switch style="justify-content: start;"></toggle-switch>
    `;
  }
  handle(context) {
    let result = null;

    let input = context.target.nextElementSibling.checked;
    // blank selects all, apply filter if non-blank
    if (input) {
      result = {
        id: context.id,
        context,
        resolveGroup: function(feature) {
          return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
        },
        resolve: function(feature) {
          // filter out features without the property
          let isValid = !!feature[context.prop]
          return isValid;
        }
      };
    }
    return result;
  }
}

export class GTLTControl {
  constructor(isDate) {
    this.id = genId();
    this.gtName = (isDate)?'after':'at least';
    this.eqName = (isDate)?'exactly':'equal to';
    this.ltName = (isDate)?'before':'less than';
  }
  get next() {
    return html`
      <select>
        <option value="gt">${this.gtName}</option>
        <option value="eq">${this.eqName}</option>
        <option value="lt">${this.ltName}</option>
      </select>
      <input type="text">
    `;
  }
  handle(context) {
    let result = null;
    context['gt'] = (a, b) => (a >= b);
    context['eq'] = (a, b) => (a == b);
    context['lt'] = (a, b) => (a < b);

    const predicate = context[context.target.nextElementSibling.value];
    const input = context.target.nextElementSibling.nextElementSibling.value;
    // blank selects all, apply filter if non-blank
    if (input) {
      result = {
        id: context.id,
        context,
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

export class SelectControl {
  constructor() {
    this.id = genId();
  }
  get next() {
    return html`
      <select ?disabled="${!this.options}">
        <option></option>
        ${(!this.options)?'':this.options.map((el) => html`
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
        context,
        resolveGroup: function(feature) {
          return !context.group.prop || context.group[context.group.prop] === feature[context.group.prop]
        },
        resolve: function(feature) {
          // filter out features without the property
          let isValid = !!feature[context.prop];
          if (isValid) {
            const value = feature[context.prop]
            isValid = value === input;
          }
          return isValid;
        }
      };
    }
    return result;
  }
}

export class TextControl {
  constructor() {
    this.id = genId();
  }
  get next() {
    return html`
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
        context,
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

export class ContainsControl {
  constructor() {
    this.id = genId();
  }
  get next() {
    return html`
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
        context,
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