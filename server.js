const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const simpleGit = require('simple-git');

const app = express();
app.use(cors());
app.use(express.json());

const blitzBotsDirectory = path.join(os.homedir(), 'blitz-bots');

if (!fs.existsSync(blitzBotsDirectory)) {
  fs.mkdirSync(blitzBotsDirectory, { recursive: true });
}

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server Running" });
});

app.get('/directories', (req, res) => {
  fs.readdir(blitzBotsDirectory, { withFileTypes: true }, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to read directory', details: err.message });
    const directories = files.filter(file => file.isDirectory()).map(file => file.name);
    res.json({ directories });
  });
});

app.post('/create', async (req, res) => {
  const { name, token } = req.body;

  if (!name || !token) {
    return res.status(400).json({ error: 'Name and token are required' });
  }

  const newBotDirectory = path.join(blitzBotsDirectory, name);

  if (fs.existsSync(newBotDirectory)) {
    return res.status(400).json({ error: `A bot with the name "${name}" already exists.` });
  }

  try {
    fs.mkdirSync(newBotDirectory, { recursive: true });
    const pluginsFolder = path.join(newBotDirectory, 'plugins');
    fs.mkdirSync(pluginsFolder);

    const botJsUrl = 'https://raw.githubusercontent.com/BLITZ-BOTS/blitz-builder/refs/heads/main/event.js';
    const botJsCode = await axios.get(botJsUrl).then((response) => response.data);
    const botJsPath = path.join(newBotDirectory, 'bot.js');
    fs.writeFileSync(botJsPath, botJsCode);

    const configFilePath = path.join(newBotDirectory, 'config.json');
    const configData = { bot_token: token, prefix: "!" };
    fs.writeFileSync(configFilePath, JSON.stringify(configData, null, 2));

    res.json({
      message: `Bot folder for "${name}" created successfully.`,
      folder: newBotDirectory,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create bot folder', details: err.message });
  }
});

app.post('/plugin/add/:app_name/:plugin_name', async (req, res) => {
  const { app_name, plugin_name } = req.params;
  const botDirectory = path.join(blitzBotsDirectory, app_name);
  
  if (!fs.existsSync(botDirectory)) {
    return res.status(404).json({ error: `Bot "${app_name}" not found.` });
  }

  const pluginsFolder = path.join(botDirectory, 'plugins');
  if (!fs.existsSync(pluginsFolder)) fs.mkdirSync(pluginsFolder);

  try {
    const pluginInfoUrl = `https://blitz-pugins.charcodes.online/plugin/${plugin_name}`;
    const { data: pluginData } = await axios.get(pluginInfoUrl);

    if (!pluginData || !pluginData.github_repo) {
      return res.status(404).json({ error: `Plugin "${plugin_name}" not found.` });
    }

    const githubRepoUrl = `https://github.com/${pluginData.github_repo}`;
    const pluginDirectory = path.join(pluginsFolder, plugin_name);

    if (fs.existsSync(pluginDirectory)) {
      return res.status(400).json({ error: `Plugin "${plugin_name}" already exists in the bot "${app_name}".` });
    }

    const git = simpleGit();
    await git.clone(githubRepoUrl, pluginDirectory);

    res.json({ message: `Plugin "${plugin_name}" added to bot "${app_name}" successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add plugin', details: err.message });
  }
});

app.get('/app/:name', (req, res) => {
  const { name } = req.params;
  const botDirectory = path.join(blitzBotsDirectory, name);

  if (!fs.existsSync(botDirectory)) {
    return res.status(404).json({ error: `Bot "${name}" not found.` });
  }

  try {
    const manifestPath = path.join(botDirectory, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

    const pluginsDirectory = path.join(botDirectory, 'plugins');
    const pluginFolders = fs.existsSync(pluginsDirectory)
      ? fs.readdirSync(pluginsDirectory, { withFileTypes: true }).filter(file => file.isDirectory()).map(file => file.name)
      : [];

    const configPath = path.join(botDirectory, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    res.json({
      name,
      directory: botDirectory,
      manifest,
      plugins: pluginFolders,
      config
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve bot information', details: err.message });
  }
});

// New route to update or add data to config.json
app.patch('/config/update/:name', (req, res) => {
  const { name } = req.params;
  const botDirectory = path.join(blitzBotsDirectory, name);
  const configFilePath = path.join(botDirectory, 'config.json');

  if (!fs.existsSync(botDirectory)) {
    return res.status(404).json({ error: `Bot "${name}" not found.` });
  }

  if (!fs.existsSync(configFilePath)) {
    return res.status(404).json({ error: `Config file for bot "${name}" not found.` });
  }

  try {
    const currentConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    const updatedConfig = { ...currentConfig, ...req.body }; // Merge new data with the current config
    fs.writeFileSync(configFilePath, JSON.stringify(updatedConfig, null, 2));

    res.json({
      message: `Config for bot "${name}" updated successfully.`,
      updatedConfig
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config', details: err.message });
  }
});

app.delete('/delete/:name', (req, res) => {
  const { name } = req.params;
  const botDirectoryPath = path.join(blitzBotsDirectory, name);

  if (!fs.existsSync(botDirectoryPath)) {
    return res.status(404).json({ error: `Bot "${name}" not found.` });
  }

  fs.rm(botDirectoryPath, { recursive: true, force: true }, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete bot', details: err.message });
    }
    res.json({ message: `Bot "${name}" deleted successfully.` });
  });
});

app.listen(8115, () => {
  console.log(`Server running on port 8115. Serving directory: ${blitzBotsDirectory}`);
});
