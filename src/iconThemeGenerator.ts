/**
 * Icon Theme Generator for Adaptive Icons
 * Generates monochrome icons that use the accent color
 */

import * as fs from 'fs';
import * as path from 'path';
import { adjustLightness, adjustSaturation } from './colorUtils';

export interface IconThemeConfig {
  file: string;
  folder: string;
  folderExpanded: string;
  rootFolder: string;
  rootFolderExpanded: string;
  iconDefinitions: Record<string, { iconPath: string }>;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  languageIds: Record<string, string>;
  light?: Partial<IconThemeConfig>;
  highContrast?: Partial<IconThemeConfig>;
  hidesExplorerArrows?: boolean;
}

/**
 * Convert an SVG to monochrome using the accent color
 */
export function convertSvgToMonochrome(svgContent: string, accentColor: string): string {
  const accentLight = adjustLightness(accentColor, 0.15);
  const accentDark = adjustLightness(accentColor, -0.1);

  let result = svgContent;

  // Remove data attributes used by the original theme
  result = result.replace(/\s*data-themed="true"/g, '');
  result = result.replace(/\s*data-folderColor="[^"]*"/g, '');
  result = result.replace(/\s*data-folderIconColor="[^"]*"/g, '');
  result = result.replace(/\s*data-iconColor="[^"]*"/g, '');

  // Helper function to expand 3-digit hex to 6-digit
  const expandHex = (hex: string): string => {
    if (hex.length === 3) {
      return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return hex;
  };

  // Helper function to calculate luminance and return appropriate accent color
  const getAccentForColor = (hexColor: string): string => {
    const expanded = expandHex(hexColor);
    const r = parseInt(expanded.substring(0, 2), 16) / 255;
    const g = parseInt(expanded.substring(2, 4), 16) / 255;
    const b = parseInt(expanded.substring(4, 6), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    if (luminance > 0.7) {
      return accentLight;
    } else if (luminance > 0.3) {
      return accentColor;
    } else {
      return accentDark;
    }
  };

  // Replace hex color fills (6-digit and 3-digit)
  result = result.replace(/fill="#([0-9A-Fa-f]{6})"/g, (match, hexColor) => {
    return `fill="${getAccentForColor(hexColor)}"`;
  });
  result = result.replace(/fill="#([0-9A-Fa-f]{3})"/g, (match, hexColor) => {
    return `fill="${getAccentForColor(hexColor)}"`;
  });

  // Handle stroke colors
  result = result.replace(/stroke="#([0-9A-Fa-f]{6})"/g, (match, hexColor) => {
    return `stroke="${getAccentForColor(hexColor)}"`;
  });
  result = result.replace(/stroke="#([0-9A-Fa-f]{3})"/g, (match, hexColor) => {
    return `stroke="${getAccentForColor(hexColor)}"`;
  });

  // Handle rgb() colors
  result = result.replace(/fill="rgb\([^)]+\)"/gi, `fill="${accentColor}"`);
  result = result.replace(/stroke="rgb\([^)]+\)"/gi, `stroke="${accentColor}"`);

  // Handle style attributes with fill
  result = result.replace(/style="([^"]*fill:\s*#)([0-9A-Fa-f]{6})([^"]*)"/g, 
    (match, before, hexColor, after) => {
      return `style="${before.replace('#', '')}${accentColor.replace('#', '')}${after}"`;
    }
  );

  return result;
}

/**
 * Process all SVG files in a directory and convert them to monochrome
 */
export function processIconDirectory(
  sourceDir: string, 
  destDir: string, 
  accentColor: string
): void {
  if (!fs.existsSync(sourceDir)) {
    console.log(`Adaptive Icons: Source directory not found: ${sourceDir}`);
    return;
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const files = fs.readdirSync(sourceDir);
  
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      processIconDirectory(sourcePath, path.join(destDir, file), accentColor);
    } else if (file.endsWith('.svg')) {
      const svgContent = fs.readFileSync(sourcePath, 'utf-8');
      const monochromeContent = convertSvgToMonochrome(svgContent, accentColor);
      fs.writeFileSync(path.join(destDir, file), monochromeContent, 'utf-8');
    }
  }
}

/**
 * Find an icon definition by name (case-insensitive)
 */
function findIconDef(
  iconDefinitions: Record<string, { iconPath: string }>,
  baseName: string,
  prefix: string = '_file_'
): string | null {
  const exactKey = `${prefix}${baseName}`;
  if (iconDefinitions[exactKey]) {
    return exactKey;
  }
  
  const lowerBaseName = baseName.toLowerCase();
  for (const key of Object.keys(iconDefinitions)) {
    if (key.startsWith(prefix) && key.toLowerCase() === `${prefix}${lowerBaseName}`) {
      return key;
    }
  }
  
  return null;
}

/**
 * Generate the icon theme JSON configuration
 */
export function generateIconThemeJson(
  iconsDir: string,
  iconSourcePath: string
): IconThemeConfig {
  const filesDir = path.join(iconsDir, 'files');
  const foldersDir = path.join(iconsDir, 'folders');
  const foldersOpenDir = path.join(iconsDir, 'foldersOpen');

  const iconDefinitions: Record<string, { iconPath: string }> = {};
  const fileExtensions: Record<string, string> = {};
  const fileNames: Record<string, string> = {};
  const folderNames: Record<string, string> = {};
  const folderNamesExpanded: Record<string, string> = {};
  const languageIds: Record<string, string> = {};

  // Process file icons
  if (fs.existsSync(filesDir)) {
    const fileIcons = fs.readdirSync(filesDir).filter(f => f.endsWith('.svg'));
    for (const icon of fileIcons) {
      const iconName = path.basename(icon, '.svg');
      const defName = `_file_${iconName}`;
      iconDefinitions[defName] = { iconPath: `../icons/files/${icon}` };
    }
  }

  // Process folder icons
  if (fs.existsSync(foldersDir)) {
    const folderIcons = fs.readdirSync(foldersDir).filter(f => f.endsWith('.svg'));
    for (const icon of folderIcons) {
      const iconName = path.basename(icon, '.svg');
      const defName = `_folder_${iconName}`;
      iconDefinitions[defName] = { iconPath: `../icons/folders/${icon}` };
    }
  }

  // Process folder open icons
  if (fs.existsSync(foldersOpenDir)) {
    const folderOpenIcons = fs.readdirSync(foldersOpenDir).filter(f => f.endsWith('.svg'));
    for (const icon of folderOpenIcons) {
      const iconName = path.basename(icon, '.svg');
      const defName = `_folder_${iconName}_open`;
      iconDefinitions[defName] = { iconPath: `../icons/foldersOpen/${icon}` };
    }
  }

  // Load associations from the original icon theme
  const iconAssociationsPath = path.join(iconSourcePath, 'iconGenerator', 'icon-associations.json');
  const folderAssociationsPath = path.join(iconSourcePath, 'iconGenerator', 'folder-associations.json');

  if (fs.existsSync(iconAssociationsPath)) {
    try {
      const iconAssociations = JSON.parse(fs.readFileSync(iconAssociationsPath, 'utf-8'));
      processIconAssociations(iconAssociations, iconDefinitions, fileExtensions, fileNames, languageIds);
    } catch (e) {
      console.log('Adaptive Icons: Could not load icon associations:', e);
    }
  }

  if (fs.existsSync(folderAssociationsPath)) {
    try {
      const folderAssociations = JSON.parse(fs.readFileSync(folderAssociationsPath, 'utf-8'));
      processFolderAssociations(folderAssociations, iconDefinitions, folderNames, folderNamesExpanded);
    } catch (e) {
      console.log('Adaptive Icons: Could not load folder associations:', e);
    }
  }

  // Add common mappings
  addCommonFileExtensions(fileExtensions, iconDefinitions);
  addCommonFolderNames(folderNames, folderNamesExpanded, iconDefinitions);
  addCommonLanguageIds(languageIds, iconDefinitions);

  return {
    file: '_file_file',
    folder: '_folder_folder',
    folderExpanded: '_folder_folder_open',
    rootFolder: '_folder_root',
    rootFolderExpanded: '_folder_root_open',
    iconDefinitions,
    fileExtensions,
    fileNames,
    folderNames,
    folderNamesExpanded,
    languageIds,
    hidesExplorerArrows: false,
  };
}

/**
 * Process icon associations from the original theme
 */
function processIconAssociations(
  associations: any,
  iconDefinitions: Record<string, { iconPath: string }>,
  fileExtensions: Record<string, string>,
  fileNames: Record<string, string>,
  languageIds: Record<string, string>
): void {
  const regexAssocs = associations?.associations?.associations?.regex || [];
  for (const assoc of regexAssocs) {
    const value = assoc.value;
    if (!value) continue;

    const iconPath = value.icon;
    if (!iconPath) continue;

    const iconName = path.basename(iconPath, '.svg');
    const defName = `_file_${iconName}`;

    if (value.fileNames) {
      const names = value.fileNames.split(',');
      for (const name of names) {
        const trimmed = name.trim().toLowerCase();
        if (trimmed && iconDefinitions[defName]) {
          fileNames[trimmed] = defName;
        }
      }
    }
  }
}

/**
 * Process folder associations from the original theme
 */
function processFolderAssociations(
  associations: any,
  iconDefinitions: Record<string, { iconPath: string }>,
  folderNames: Record<string, string>,
  folderNamesExpanded: Record<string, string>
): void {
  const regexAssocs = associations?.associations?.associations?.regex || [];
  
  for (const assoc of regexAssocs) {
    const value = assoc.value;
    if (!value) continue;

    const iconPath = value.icon;
    if (!iconPath) continue;

    const iconName = path.basename(iconPath, '.svg');
    const defName = `_folder_${iconName}`;
    const defNameOpen = `_folder_${iconName}_open`;

    if (value.folderNames) {
      const names = value.folderNames.split(',');
      for (const name of names) {
        const trimmed = name.trim().toLowerCase();
        if (trimmed) {
          if (iconDefinitions[defName]) {
            folderNames[trimmed] = defName;
          }
          if (iconDefinitions[defNameOpen]) {
            folderNamesExpanded[trimmed] = defNameOpen;
          }
        }
      }
    }
  }
}

/**
 * Add common file extension mappings
 */
function addCommonFileExtensions(
  fileExtensions: Record<string, string>,
  iconDefinitions: Record<string, { iconPath: string }>
): void {
  const extensionMappings: Record<string, string[]> = {
    // JavaScript/TypeScript
    'js': ['javascript', 'javaScript', 'js'],
    'mjs': ['javascript', 'javaScript', 'js'],
    'cjs': ['javascript', 'javaScript', 'js'],
    'jsx': ['react', 'jsx', 'reactJs'],
    'ts': ['typescript', 'typeScript', 'ts'],
    'tsx': ['react_ts', 'reactTs', 'tsx', 'react'],
    'mts': ['typescript', 'typeScript', 'ts'],
    'cts': ['typescript', 'typeScript', 'ts'],
    
    // Web
    'html': ['html', 'html5'],
    'htm': ['html', 'html5'],
    'css': ['css', 'css3'],
    'scss': ['sass', 'scss'],
    'sass': ['sass', 'scss'],
    'less': ['less'],
    'vue': ['vue'],
    'svelte': ['svelte'],
    
    // Data formats
    'json': ['json'],
    'jsonc': ['json'],
    'json5': ['json'],
    'yaml': ['yaml', 'yml'],
    'yml': ['yaml', 'yml'],
    'xml': ['xml'],
    'toml': ['toml'],
    'csv': ['csv'],
    
    // Config files
    'env': ['tune', 'env', 'dotenv'],
    'ini': ['settings', 'ini', 'config'],
    'cfg': ['settings', 'cfg', 'config'],
    'conf': ['settings', 'conf', 'config'],
    
    // Documentation
    'md': ['markdown', 'md'],
    'mdx': ['mdx', 'markdown'],
    'txt': ['text', 'txt'],
    'rst': ['rst'],
    
    // Programming languages
    'py': ['python', 'py'],
    'pyw': ['python', 'py'],
    'pyx': ['cython', 'python'],
    'rb': ['ruby', 'rb'],
    'go': ['go', 'golang'],
    'rs': ['rust', 'rs'],
    'java': ['java'],
    'kt': ['kotlin', 'kt'],
    'kts': ['kotlin', 'kt'],
    'scala': ['scala'],
    'c': ['c'],
    'h': ['c', 'h', 'header'],
    'cpp': ['cpp', 'cplusplus', 'c++'],
    'cc': ['cpp', 'cplusplus'],
    'cxx': ['cpp', 'cplusplus'],
    'hpp': ['cpp', 'hpp', 'cplusplus'],
    'hxx': ['cpp', 'cplusplus'],
    'cs': ['csharp', 'cs', 'c#'],
    'fs': ['fsharp', 'fs', 'f#'],
    'php': ['php'],
    'swift': ['swift'],
    'r': ['r'],
    'dart': ['dart'],
    'ex': ['elixir', 'ex'],
    'exs': ['elixir', 'exs'],
    'erl': ['erlang', 'erl'],
    'hrl': ['erlang', 'hrl'],
    'lua': ['lua'],
    'pl': ['perl', 'pl'],
    'pm': ['perl', 'pm'],
    'hs': ['haskell', 'hs'],
    'lhs': ['haskell', 'lhs'],
    'clj': ['clojure', 'clj'],
    'cljs': ['clojurescript', 'cljs', 'clojure'],
    'jl': ['julia', 'jl'],
    'nim': ['nim'],
    'zig': ['zig'],
    'v': ['vlang', 'v'],
    
    // Shell
    'sh': ['shell', 'bash', 'sh'],
    'bash': ['bash', 'shell'],
    'zsh': ['zsh', 'shell'],
    'fish': ['fish', 'shell'],
    'ps1': ['powershell', 'ps1'],
    'psm1': ['powershell', 'psm1'],
    'bat': ['bat', 'batch', 'cmd'],
    'cmd': ['cmd', 'bat', 'batch'],
    
    // Database
    'sql': ['database', 'sql', 'db'],
    'sqlite': ['database', 'sqlite', 'db'],
    'db': ['database', 'db'],
    
    // Images
    'png': ['image', 'png'],
    'jpg': ['image', 'jpg', 'jpeg'],
    'jpeg': ['image', 'jpeg', 'jpg'],
    'gif': ['image', 'gif'],
    'bmp': ['image', 'bmp'],
    'ico': ['image', 'ico'],
    'webp': ['image', 'webp'],
    'svg': ['svg'],
    
    // Documents
    'pdf': ['pdf'],
    'doc': ['word', 'doc'],
    'docx': ['word', 'docx'],
    'xls': ['table', 'excel', 'xls'],
    'xlsx': ['table', 'excel', 'xlsx'],
    'ppt': ['ppt', 'powerpoint'],
    'pptx': ['ppt', 'powerpoint'],
    
    // Archives
    'zip': ['zip', 'archive'],
    'tar': ['zip', 'tar', 'archive'],
    'gz': ['zip', 'gzip', 'archive'],
    'rar': ['zip', 'rar', 'archive'],
    '7z': ['zip', '7z', 'archive'],
    'bz2': ['zip', 'bzip', 'archive'],
    'xz': ['zip', 'xz', 'archive'],
    
    // DevOps
    'dockerfile': ['docker', 'dockerfile'],
    
    // Git
    'gitignore': ['git', 'gitignore'],
    'gitattributes': ['git', 'gitattributes'],
    'gitmodules': ['git', 'gitmodules'],
    
    // License
    'license': ['license', 'licence'],
    'licence': ['license', 'licence'],
    
    // Lock files
    'lock': ['lock'],
    
    // Wolfram Language
    'wl': ['wolframLanguage', 'wolfram', 'mathematica', 'wl'],
    'm': ['wolframLanguage', 'wolfram', 'mathematica', 'matlab'],
    'wls': ['wolframLanguageScript', 'wolframScript', 'wls'],
    'nb': ['wolframNotebook', 'notebook', 'nb'],
    'wlt': ['wolframTest', 'wlt'],
    'mt': ['wolframTest', 'mt'],
    'paclet': ['paclet'],
  };

  for (const [ext, possibleNames] of Object.entries(extensionMappings)) {
    for (const iconName of possibleNames) {
      const defName = findIconDef(iconDefinitions, iconName, '_file_');
      if (defName) {
        fileExtensions[ext] = defName;
        break;
      }
    }
  }
}

/**
 * Add common folder name mappings
 */
function addCommonFolderNames(
  folderNames: Record<string, string>,
  folderNamesExpanded: Record<string, string>,
  iconDefinitions: Record<string, { iconPath: string }>
): void {
  const folderMappings: Record<string, string[]> = {
    'src': ['src', 'source'],
    'source': ['src', 'source'],
    'lib': ['lib', 'library'],
    'libs': ['lib', 'library'],
    'dist': ['dist', 'build', 'output'],
    'build': ['build', 'dist'],
    'out': ['dist', 'out', 'output'],
    'output': ['dist', 'output'],
    'bin': ['bin', 'dist'],
    'test': ['test', 'tests'],
    'tests': ['test', 'tests'],
    '__tests__': ['test', 'tests'],
    'spec': ['test', 'spec'],
    'specs': ['test', 'spec'],
    'node_modules': ['node', 'nodeModules', 'node_modules'],
    'vendor': ['vendor', 'lib'],
    'packages': ['packages', 'package'],
    'components': ['components', 'component'],
    'hooks': ['hook', 'hooks'],
    'utils': ['utils', 'util', 'utility'],
    'helpers': ['helper', 'helpers'],
    'config': ['config', 'configuration'],
    'configs': ['config', 'configuration'],
    'public': ['public'],
    'static': ['public', 'static'],
    'assets': ['assets', 'asset'],
    'images': ['images', 'image', 'img'],
    'img': ['images', 'image', 'img'],
    'icons': ['icons', 'icon'],
    'fonts': ['font', 'fonts'],
    'styles': ['styles', 'style', 'css'],
    'css': ['styles', 'css'],
    'sass': ['sass', 'scss'],
    'scss': ['sass', 'scss'],
    'docs': ['docs', 'documentation', 'doc'],
    'documentation': ['docs', 'documentation'],
    'api': ['api'],
    'services': ['server', 'services', 'service'],
    'models': ['class', 'models', 'model'],
    'views': ['view', 'views'],
    'controllers': ['controller', 'controllers'],
    'middleware': ['middleware'],
    'routes': ['routes', 'route'],
    'types': ['typescript', 'types', 'ts'],
    'interfaces': ['typescript', 'interfaces', 'interface'],
    '.git': ['git'],
    '.github': ['github'],
    '.vscode': ['vscode'],
    '.idea': ['idea'],
    'docker': ['docker'],
    'scripts': ['scripts', 'script'],
    'tools': ['tools', 'tool'],
    'temp': ['temp', 'tmp'],
    'tmp': ['temp', 'tmp'],
    'cache': ['cache'],
    '.cache': ['cache'],
    'logs': ['log', 'logs'],
    'log': ['log', 'logs'],
    'i18n': ['i18n', 'locale', 'locales'],
    'locales': ['i18n', 'locale', 'locales'],
    'lang': ['i18n', 'lang', 'language'],
    'languages': ['i18n', 'languages'],
    'translations': ['i18n', 'translations'],
  };

  for (const [name, possibleNames] of Object.entries(folderMappings)) {
    for (const iconName of possibleNames) {
      const defName = findIconDef(iconDefinitions, iconName, '_folder_');
      const defNameOpen = findIconDef(iconDefinitions, `${iconName}_open`, '_folder_');
      
      if (defName && !folderNames[name]) {
        folderNames[name] = defName;
      }
      if (defNameOpen && !folderNamesExpanded[name]) {
        folderNamesExpanded[name] = defNameOpen;
      }
      
      if (folderNames[name] && folderNamesExpanded[name]) {
        break;
      }
    }
  }
}

/**
 * Add common language ID mappings
 */
function addCommonLanguageIds(
  languageIds: Record<string, string>,
  iconDefinitions: Record<string, { iconPath: string }>
): void {
  const languageMappings: Record<string, string[]> = {
    'javascript': ['javascript', 'javaScript', 'js'],
    'typescript': ['typescript', 'typeScript', 'ts'],
    'javascriptreact': ['react', 'jsx', 'reactJs'],
    'typescriptreact': ['react_ts', 'reactTs', 'tsx', 'react'],
    'html': ['html', 'html5'],
    'css': ['css', 'css3'],
    'scss': ['sass', 'scss'],
    'sass': ['sass', 'scss'],
    'less': ['less'],
    'json': ['json'],
    'jsonc': ['json'],
    'yaml': ['yaml', 'yml'],
    'xml': ['xml'],
    'markdown': ['markdown', 'md'],
    'python': ['python', 'py'],
    'ruby': ['ruby', 'rb'],
    'go': ['go', 'golang'],
    'rust': ['rust', 'rs'],
    'java': ['java'],
    'kotlin': ['kotlin', 'kt'],
    'scala': ['scala'],
    'c': ['c'],
    'cpp': ['cpp', 'cplusplus', 'c++'],
    'csharp': ['csharp', 'cs', 'c#'],
    'fsharp': ['fsharp', 'fs', 'f#'],
    'php': ['php'],
    'swift': ['swift'],
    'r': ['r'],
    'dart': ['dart'],
    'elixir': ['elixir', 'ex'],
    'erlang': ['erlang', 'erl'],
    'lua': ['lua'],
    'perl': ['perl', 'pl'],
    'haskell': ['haskell', 'hs'],
    'clojure': ['clojure', 'clj'],
    'julia': ['julia', 'jl'],
    'shellscript': ['shell', 'bash', 'sh'],
    'powershell': ['powershell', 'ps1'],
    'sql': ['database', 'sql', 'db'],
    'dockerfile': ['docker', 'dockerfile'],
    'vue': ['vue'],
    'svelte': ['svelte'],
    'wolfram': ['wolframLanguage', 'wolfram', 'mathematica', 'wl'],
  };

  for (const [langId, possibleNames] of Object.entries(languageMappings)) {
    for (const iconName of possibleNames) {
      const defName = findIconDef(iconDefinitions, iconName, '_file_');
      if (defName) {
        languageIds[langId] = defName;
        break;
      }
    }
  }
}

/**
 * Write the icon theme JSON file
 */
export function writeIconThemeFile(
  extensionPath: string,
  themeConfig: IconThemeConfig
): void {
  const themePath = path.join(extensionPath, 'themes', 'adaptive-icons.json');
  
  const themesDir = path.dirname(themePath);
  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
  }

  fs.writeFileSync(themePath, JSON.stringify(themeConfig, null, 2), 'utf-8');
  console.log(`Adaptive Icons: Written theme to ${themePath}`);
}

/**
 * Generate the complete adaptive icon theme
 */
export function generateAdaptiveIconTheme(
  extensionPath: string,
  iconSourcePath: string,
  accentColor: string
): void {
  const iconsDestDir = path.join(extensionPath, 'icons');
  const iconSourceDir = path.join(iconSourcePath, 'iconGenerator', 'assets', 'icons');

  const subDirs = ['files', 'folders', 'foldersOpen'];
  
  for (const subDir of subDirs) {
    const sourceDir = path.join(iconSourceDir, subDir);
    const destDir = path.join(iconsDestDir, subDir);
    
    if (fs.existsSync(sourceDir)) {
      processIconDirectory(sourceDir, destDir, accentColor);
    }
  }

  const themeConfig = generateIconThemeJson(iconsDestDir, iconSourcePath);
  writeIconThemeFile(extensionPath, themeConfig);
}

/**
 * Generate a minimal fallback icon theme
 */
export function generateFallbackIconTheme(
  extensionPath: string,
  accentColor: string
): void {
  const iconsDir = path.join(extensionPath, 'icons');
  const subDirs = ['files', 'folders', 'foldersOpen'];
  
  for (const subDir of subDirs) {
    const dir = path.join(iconsDir, subDir);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const svgContent = fs.readFileSync(filePath, 'utf-8');
        const monochromeContent = convertSvgToMonochrome(svgContent, accentColor);
        fs.writeFileSync(filePath, monochromeContent, 'utf-8');
      }
    }
  }

  const themeConfig: IconThemeConfig = {
    file: '_file_file',
    folder: '_folder_folder',
    folderExpanded: '_folder_folder_open',
    rootFolder: '_folder_root',
    rootFolderExpanded: '_folder_root_open',
    iconDefinitions: {
      '_file_file': { iconPath: '../icons/files/file.svg' },
      '_folder_folder': { iconPath: '../icons/folders/folder.svg' },
      '_folder_folder_open': { iconPath: '../icons/foldersOpen/folder.svg' },
      '_folder_root': { iconPath: '../icons/folders/root.svg' },
      '_folder_root_open': { iconPath: '../icons/foldersOpen/root.svg' },
    },
    fileExtensions: {},
    fileNames: {},
    folderNames: {},
    folderNamesExpanded: {},
    languageIds: {},
    hidesExplorerArrows: false,
  };

  writeIconThemeFile(extensionPath, themeConfig);
}
