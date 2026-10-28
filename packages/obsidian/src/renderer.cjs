// Desktop integration with the native graph's undocumented renderer.
const { Setting, FileSystemAdapter } = require('obsidian');
const { selectTraceability } = require('../../cli/src/graph-view/policy.cjs');
const { describeNode } = require('../../cli/src/graph-view/node-style.cjs');
function attach(view) {
    const options = this.options;
    const document = view.containerEl.ownerDocument;
    const controls = document.createElement('div');
    controls.dataset.dotdotgodControls = 'true';
    controls.className = 'tree-item graph-control-section is-collapsed';
    const summary = view.dataEngine.controlsEl.querySelector('.graph-control-section > .tree-item-self').cloneNode(true);
    summary.querySelector('.graph-control-section-header').textContent = this.t('section');
    const icon = summary.querySelector('.collapse-icon');
    icon.classList.add('is-collapsed');
    const body = document.createElement('div');
    body.className = 'tree-item-children';
    body.hidden = true;
    summary.setAttribute('role', 'button');
    summary.tabIndex = 0;
    summary.setAttribute('aria-expanded', 'false');
    const toggleSection = () => {
      const collapsed = controls.classList.toggle('is-collapsed');
      icon.classList.toggle('is-collapsed', collapsed);
      body.hidden = collapsed;
      summary.setAttribute('aria-expanded', String(!collapsed));
    };
    summary.addEventListener('click', toggleSection);
    summary.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSection(); }
    });
    controls.append(summary, body);
    const update = async (key, value) => {
      this.options[key] = value;
      await this.saveData(this.options);
      if (!this.stopped) { this.detach(); this.refresh(); }
    };
    for (const key of ['documentsOnly', 'showLegend', 'weightedLines']) {
      new Setting(body).setName(this.t(key)).addToggle(toggle => toggle.setValue(options[key]).onChange(value => update(key, value).catch(error => this.report(error, 'saveError'))));
    }
    new Setting(body).setName(this.t('reload')).addButton(button => button.setButtonText(this.t('refresh')).onClick(async () => {
      button.setDisabled(true);
      try { await this.loadGraph(); } catch (error) { this.report(error); }
      finally { button.setDisabled(false); }
    }));
    view.dataEngine.controlsEl.appendChild(controls);
    // The native renderer has one directed link per file pair. Highest configured
    // weight wins; ties use relation ID for deterministic styling.
    const filtered = selectTraceability(this.graph, options);
    const allEndpoints = new Set(this.graph.edges.flatMap(e => [e.source, e.target]));
    const relations = filtered.edges.map(e => [e.source, e.target, e.relation, e.weight, parseInt(e.color.slice(1), 16)]);
    const r = view.renderer;
    const original = r.setData;
    const originalArrow = r.fShowArrow;
    const originalClick = r.onNodeClick;
    const originalHover = r.onNodeHover;
    const originalUnhover = r.onNodeUnhover;
    const hooks = new Map();
    const nodeHooks = new Map();
    const overlay = document.createElement('div');
    const documentationRoot = this.graph.config.documentation.root;
    const tooltip = document.createElement('div');
    tooltip.dataset.dotdotgodTooltip = 'true';
    tooltip.className = 'dotdotgod-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    const tooltipDocument = r.containerEl.ownerDocument;
    tooltipDocument.body.appendChild(tooltip);
    let hoveredPath = null;
    const positionTooltip = event => {
      if (!hoveredPath) return;
      const frame = event.view?.frameElement;
      const bounds = frame?.getBoundingClientRect();
      const scaleX = frame ? bounds.width / (frame.clientWidth || bounds.width) : 1;
      const scaleY = frame ? bounds.height / (frame.clientHeight || bounds.height) : 1;
      const x = event.clientX * scaleX + (bounds?.left ?? 0);
      const y = event.clientY * scaleY + (bounds?.top ?? 0);
      const win = tooltipDocument.defaultView;
      const box = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(x + 12, win.innerWidth - box.width - 8))}px`;
      tooltip.style.top = `${Math.max(8, y + 18 + box.height < win.innerHeight - 8 ? y + 18 : y - box.height - 12)}px`;
    };
    // Install rollback before touching any native handlers or graphics.
    let restored = false;
    this.bindings.set(r, { restore: (refresh) => {
      if (restored) return;
      restored = true;
      r.setData = original;
      r.fShowArrow = originalArrow;
      r.onNodeClick = originalClick;
      r.onNodeHover = originalHover;
      r.onNodeUnhover = originalUnhover;
      for (const [link, render] of hooks) link.render = render;
      for (const [node, fill] of nodeHooks) node.getFillColor = fill;
      overlay.remove();
      tooltip.remove();
      r.interactiveEl.removeEventListener('pointermove', positionTooltip);
      controls.remove();
      if (refresh) view.dataEngine.render();
    } });
    r.onNodeHover = function (event, path) {
      hoveredPath = path;
      tooltip.textContent = describeNode(path, documentationRoot).label;
      tooltip.style.display = 'block';
      positionTooltip(event);
    };
    r.onNodeUnhover = function () { hoveredPath = null; tooltip.style.display = 'none'; };
    r.interactiveEl.addEventListener('pointermove', positionTooltip);
    const graphFiles = new Set(relations.flatMap(e => e.slice(0, 2)));
    const plugin = this;
    r.onNodeClick = function (event, path, type) {
      if (graphFiles.has(path) && !/\.md$/i.test(path) && plugin.app.vault.adapter instanceof FileSystemAdapter) {
        // Reveal rather than execute non-Markdown files through OS associations.
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (file && typeof file.extension === 'string') require('electron').shell.showItemInFolder(
          require('node:path').join(plugin.app.vault.adapter.getBasePath(), path));
      } else originalClick?.call(this, event, path, type);
    };
    overlay.dataset.dotdotgodLegend = 'true';
    overlay.className = 'dotdotgod-legend';
    overlay.setAttribute('aria-label', this.t('legend'));
    for (const { label, relation, color } of this.graph.types) {
      const item = document.createElement('button');
      item.type = 'button';
      const enabled = !options.disabledRelations.includes(relation);
      item.setAttribute('aria-pressed', String(enabled));
      item.dataset.relation = relation;
      item.addEventListener('click', () => {
        const disabled = new Set(options.disabledRelations);
        if (disabled.has(relation)) disabled.delete(relation); else disabled.add(relation);
        update('disabledRelations', [...disabled]).catch(error => this.report(error, 'saveError'));
      });
      const swatch = document.createElement('span');
      swatch.className = 'dotdotgod-relation-swatch';
      swatch.style.backgroundColor = color;
      item.title = relation;
      item.append(swatch, document.createTextNode(label));
      overlay.appendChild(item);
    }
    const groups = new Map();
    for (const path of graphFiles) {
      const style = describeNode(path, documentationRoot);
      if (style.group) groups.set(style.group, style.color);
    }
    for (const [group, color] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      const item = document.createElement('span');
      const swatch = document.createElement('span');
      swatch.className = 'dotdotgod-group-swatch';
      swatch.style.backgroundColor = color;
      item.append(swatch, document.createTextNode(group));
      overlay.appendChild(item);
    }
    r.containerEl.appendChild(overlay);
    overlay.style.display = options.showLegend ? 'flex' : 'none';
    const apply = () => {
      for (const [node, fill] of nodeHooks) if (!r.nodes.includes(node)) {
        node.getFillColor = fill;
        nodeHooks.delete(node);
      }
      for (const node of r.nodes) {
        if (nodeHooks.has(node)) continue;
        const originalFill = node.getFillColor;
        nodeHooks.set(node, originalFill);
        const group = describeNode(node.id, documentationRoot);
        const color = group.color ? parseInt(group.color.slice(1), 16) : null;
        node.getFillColor = function () {
          // Native fillHighlight overrides explicit colors. Keep the semantic
          // color on hover and use the native selection ring for emphasis.
          if (color !== null) return { rgb: color, a: 1 };
          if (r.getHighlightNode() === this) return this.color ?? r.colors.fill;
          return originalFill.call(this);
        };
      }
      for (const [link, render] of hooks) {
        if (!r.links.includes(link)) {
          link.render = render;
          hooks.delete(link);
        }
      }
      for (const [source, target, relation, weight, color] of relations) {
        const link = r.nodeLookup[source]?.forward[target];
        if (!link || hooks.has(link)) continue;
        const render = link.render;
        hooks.set(link, render);
        link.render = function () {
          render.call(this);
          if (this.line) { this.line.tint = color; if (options.weightedLines) { this.line.height = (weight + 0.5) / r.scale; this.line.y = -this.line.height / 2; } }
          if (this.arrow) this.arrow.tint = color;
        };
      }
    };
    r.setData = function (data) {
      const nodes = Object.fromEntries(Object.entries(data.nodes).map(([id, n]) => [id, { ...n, links: { ...n.links } }]));
      const activeEndpoints = new Set(relations.flatMap(e => e.slice(0, 2)));
      for (const id of allEndpoints) if (!activeEndpoints.has(id)) delete nodes[id];
      for (const [id, node] of Object.entries(nodes)) {
        for (const target of Object.keys(node.links)) {
          if (allEndpoints.has(target) && !activeEndpoints.has(target)) delete node.links[target];
          else if (allEndpoints.has(id) && allEndpoints.has(target)) delete node.links[target];
        }
      }
      if (options.documentsOnly) {
        for (const id of Object.keys(nodes)) if (!/\.md$/i.test(id)) delete nodes[id];
        for (const n of Object.values(nodes)) for (const target of Object.keys(n.links)) if (!nodes[target]) delete n.links[target];
      }
      for (const [source, target] of relations) {
        nodes[source] ??= { type: '', links: {} };
        nodes[target] ??= { type: '', links: {} };
        nodes[source].links[target] = true;
      }
      for (const [path, node] of Object.entries(nodes)) {
        const style = describeNode(path, documentationRoot);
        if (style.color) node.color = { rgb: parseInt(style.color.slice(1), 16), a: 1 };
      }
      original.call(this, { ...data, nodes });
      apply();
      for (const n of this.nodes) if (!n.rendered) n.initGraphics();
      for (const l of this.links) l.initGraphics();
      this.idleFrames = 0;
      this.renderCallback();
    };
    view.dataEngine.render();
    for (const n of r.nodes) if (!n.rendered) n.initGraphics();
    for (const l of r.links) l.initGraphics();
    r.fShowArrow = true;
    r.idleFrames = 0;
    r.renderCallback();
    r.changed();
}
module.exports = { attach };
