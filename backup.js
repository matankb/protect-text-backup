import { promises as fs } from 'fs';

import puppeteer from 'puppeteer';
import prompts from 'prompts';
import ora from 'ora';
import Cryptr from 'cryptr';

// create directory, if it doesn't exist
async function createDirectory(name) {
  try {
    return await fs.mkdir(name);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

function getContent(password) {
  const input = document.querySelector('#enterpassword');
  const decryptButton = document.querySelectorAll('.ui-dialog .ui-button')[1];

  input.value = password;
  decryptButton.click();

  const textareas = document.querySelectorAll('textarea');
  return Array.from(textareas).map(textarea => textarea.value).join('\n');
}

function getFileName() {
  const date = new Date().toLocaleDateString().replace(/\//g, '-')
  return `./backups/protected_backup_${date}.txt`;
}

function getBackupDate(fileName) {
  const [_, date] = fileName.match(/protected_backup_(.+)\.txt/);
  return new Date(date).toString().slice(0, 15);
}

async function createBackup(site) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  const spinner = ora('Creating backup');
  const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: 'Password',
  });
  
  spinner.start();
  await page.goto(`https://www.protectedtext.com/${site}`);
  
  const content = await page.evaluate(getContent, password);
  const fileName = getFileName();
  
  if (content == '') {
    spinner.stop();
    console.log('Error creating backup. Please try again.');
    return await browser.close();
  }

  const cryptr = new Cryptr(password);
  const encryptedContent = cryptr.encrypt(content);

  createDirectory('backups');
  await fs.writeFile(fileName, encryptedContent, 'utf-8');

  await browser.close();
  spinner.stop();
  console.log('Backup Created!');
};

async function isCorrectPassword(password, fileNames) {
  const content = await fs.readFile(`backups/${fileNames[0]}`, 'utf-8');
  try {
    const cryptr = new Cryptr(password);
    cryptr.decrypt(content);
    return true;
  } catch {
    return false;
  }
}

async function decryptBackups() {
  const fileNames = (await fs.readdir('./backups')).filter(f => !f.startsWith('.'));

  if (fileNames.length === 0) {
    return;
  }
  
  const { files, password } = await prompts([
    {
      type: 'password',
      name: 'password',
      message: 'Password',
      validate: async password => {
        if (await isCorrectPassword(password, fileNames)) {
          return true;
        }
        return 'Incorrect Password'
      },
    },
    {
      type: 'multiselect',
      name: 'files',
      message: 'Choose backup dates',
      instructions: false,
      choices: fileNames.reverse().map(file => ({
        title: getBackupDate(file),
        value: file
      })),
    }
  ]);

  const cryptr = new Cryptr(password);

  createDirectory('backups-plaintext');
  for (const fileName of files) {
    const content = await fs.readFile(`backups/${fileName}`, 'utf-8');
    const decryptedContent = cryptr.decrypt(content);
    fs.writeFile(`backups-plaintext/${fileName}`, decryptedContent, 'utf-8');
  }
}

function main() {
  const args = process.argv;
  const site = args[2];

  if (args.includes('--decrypt')) {
    decryptBackups();
  } else if (!site) {
    console.log('Usage: npm run backup <site>');
  } else {
    createBackup(site);
  }
}

main();