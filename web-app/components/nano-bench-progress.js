// <nano-bench-progress value max> — `value` of `max` (default 1) sets the fill; without `value`
// the bar is indeterminate, as <progress> is. Light DOM, the look in app.css.

class NanoBenchProgress extends HTMLElement {
  static observedAttributes = ['value', 'max'];

  connectedCallback() {
    if (!this._ready) {
      this._fill = document.createElement('span');
      this.replaceChildren(this._fill);
      if (!this.hasAttribute('role')) this.setAttribute('role', 'progressbar');
      this.setAttribute('aria-valuemin', '0');
      // A property set before the element upgraded is an own property shadowing the accessor.
      for (const name of ['value', 'max']) {
        if (!Object.hasOwn(this, name)) continue;
        const v = this[name];
        delete this[name];
        this[name] = v;
      }
      this._ready = true;
    }
    this.render();
  }

  attributeChangedCallback() {
    if (this._ready) this.render();
  }

  get value() {
    return Number(this.getAttribute('value')) || 0;
  }

  set value(v) {
    if (v === null || v === undefined) this.removeAttribute('value');
    else this.setAttribute('value', String(v));
  }

  get max() {
    const max = Number(this.getAttribute('max'));
    return max > 0 ? max : 1;
  }

  set max(v) {
    this.setAttribute('max', String(v));
  }

  render() {
    this.setAttribute('aria-valuemax', String(this.max));
    if (!this.hasAttribute('value')) {
      this._fill.style.width = '';
      this.removeAttribute('aria-valuenow');
      return;
    }
    const fraction = Math.min(1, Math.max(0, this.value / this.max));
    this._fill.style.width = `${100 * fraction}%`;
    this.setAttribute('aria-valuenow', String(this.value));
  }
}

customElements.define('nano-bench-progress', NanoBenchProgress);
