import { LitElement, html, css } from 'lit-element';
import { styles } from 'wgnhs-common';

/**
 * https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string
 * @param {*} a 
 * @param {*} b 
 * @param {*} c 
 * @param {*} d 
 * @param {*} e 
 */
const fileSizeIEC = function(a,b,c,d,e){
  return (b=Math,c=b.log,d=1024,e=c(a)/c(d)|0,a/b.pow(d,e)).toFixed(2)
  +' '+(e?'KMGTPEZY'[--e]+'iB':'Bytes')
 }

export class DownloadButton extends LitElement {
  static get properties() {
    return {
      src: {
        type: String
      },
      exists: {
        type: Boolean,
        reflect: true
      },
      fileSize: {
        type: String,
        attribute: false
      }
    };
  }

  constructor() {
    super();
  }

  static get styles() {
    return [
      ...styles,
      css`
      [data-closed] {
        display: none;
      }
      .file-size {
        font-size: var(--font-size-small);
      }
    `];
  }

  render() {
    return html`
    <button-link href="${this.src}" target="_blank" download>
      <i slot="content-before" class="material-icons" title="Download">save_alt</i>
      <span slot="content"><slot name="label">Download</slot></span>
      <span slot="content-after" class="file-size"><slot name="detail">${this.fileSize}</slot></span>
    </button-link>
    `;
  }

  updated(prev) {
    if (prev.has('src') && this.src) {
      this.exists = false;
      window.fetch(this.src, {
        method: 'HEAD',
        cache: 'no-store'
      }).then(resp => {
        if (resp.ok) {
          this.exists = true;
          let bytes = resp.headers.get('Content-Length');
          if (bytes) {
            this.fileSize = fileSizeIEC(bytes);
          }
        }
      });
    }
  }
}
customElements.define('download-button', DownloadButton);