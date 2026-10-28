const { PluginSettingTab, Setting } = require('obsidian');
const { graphPath } = require('./validation.cjs');
class TraceabilitySettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    const plugin = this.plugin;
    let pendingPath = plugin.options.graphPath;
    new Setting(this.containerEl).setName(plugin.t('graphPath')).setDesc(plugin.t('graphPathHelp'))
      .addText(input => input.setValue(pendingPath).onChange(value => { pendingPath = value; }));
    new Setting(this.containerEl).setName(plugin.t('reload')).addButton(button => button
      .setButtonText(plugin.t('refresh')).onClick(async () => {
        try { graphPath(pendingPath); } catch (error) { plugin.report(error, 'invalidPath'); return; }
        button.setDisabled(true);
        try {
          await plugin.saveData({ ...plugin.options, graphPath: pendingPath });
          plugin.options.graphPath = pendingPath;
          await plugin.loadGraph();
        } catch (error) { plugin.report(error); }
        finally { button.setDisabled(false); }
      }));
  }
}
module.exports = { TraceabilitySettings };
