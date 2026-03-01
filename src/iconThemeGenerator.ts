/**
 * Icon Theme Generator for Adapt Icons
 * Generates monochrome icons from source templates using the accent color
 */

import * as fs from 'fs';
import * as path from 'path';
import { adjustLightness } from './colorUtils';

/**
 * Write a file and ensure it's flushed to disk using fsync.
 * This prevents VS Code from reading stale file contents when
 * it reloads the theme immediately after generation.
 */
function writeFileSync(filePath: string, content: string): void {
	const fd = fs.openSync(filePath, 'w');
	try {
		fs.writeSync(fd, content, 0, 'utf-8');
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
}

// Import bundled associations
import iconAssociations from './associations/icon-associations.json';
import folderAssociations from './associations/folder-associations.json';

// Cache file to track last generated color
const CACHE_FILE = '.adapt-cache.json';

interface CacheData {
	accent: string;
	timestamp: number;
}

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
 * Get the last generated accent color from cache
 */
export function getLastGeneratedAccent(extensionPath: string): string | null {
	const cachePath = path.join(extensionPath, CACHE_FILE);
	try {
		if (fs.existsSync(cachePath)) {
			const data: CacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
			return data.accent;
		}
	} catch {
		// Cache read failed
	}
	return null;
}

/**
 * Save the generated accent color to cache
 */
function saveGeneratedAccent(extensionPath: string, accent: string): void {
	const cachePath = path.join(extensionPath, CACHE_FILE);
	try {
		const data: CacheData = { accent, timestamp: Date.now() };
		writeFileSync(cachePath, JSON.stringify(data, null, 2));
	} catch {
		// Cache write failed, not critical
	}
}

/**
 * Convert an SVG to monochrome using the accent color
 * 
 * The SVG icons use distinct luminance levels for visual depth:
 * - Light (luminance > 0.65) -> accentLight (brighter variant for decorator icons)
 * - Base/Dark (luminance <= 0.65) -> accentColor (main color for folder backgrounds)
 * 
 * This creates contrast between folder shapes (accent color) and their decorator 
 * icons (lighter accent), making the icons more readable.
 */
export function convertSvgToMonochrome(
	svgContent: string,
	accentColor: string,
): string {
	// Create lighter variant for decorator icons (logos, symbols inside folders)
	// +30% lightness provides good contrast against the base accent
	const accentLight = adjustLightness(accentColor, 0.30);

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
	// High luminance colors become lighter accent (decorators)
	// All other colors become the base accent (folder backgrounds)
	const getAccentForColor = (hexColor: string): string => {
		const expanded = expandHex(hexColor);
		const r = parseInt(expanded.substring(0, 2), 16) / 255;
		const g = parseInt(expanded.substring(2, 4), 16) / 255;
		const b = parseInt(expanded.substring(4, 6), 16) / 255;
		const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

		// High luminance (light colors like #e2e8f0) -> bright accent (decorator icons)
		if (luminance > 0.65) {
			return accentLight;
		}
		// All other luminance values -> base accent color (folder background)
		else {
			return accentColor;
		}
	};

	// Replace hex color fills (6-digit and 3-digit)
	result = result.replace(/fill="#([0-9A-Fa-f]{6})"/g, (_, hexColor) => {
		return `fill="${getAccentForColor(hexColor)}"`;
	});
	result = result.replace(/fill="#([0-9A-Fa-f]{3})"/g, (_, hexColor) => {
		return `fill="${getAccentForColor(hexColor)}"`;
	});

	// Handle stroke colors
	result = result.replace(/stroke="#([0-9A-Fa-f]{6})"/g, (_, hexColor) => {
		return `stroke="${getAccentForColor(hexColor)}"`;
	});
	result = result.replace(/stroke="#([0-9A-Fa-f]{3})"/g, (_, hexColor) => {
		return `stroke="${getAccentForColor(hexColor)}"`;
	});

	// Handle rgb() colors - default to base accent
	result = result.replace(/fill="rgb\([^)]+\)"/gi, `fill="${accentColor}"`);
	result = result.replace(/stroke="rgb\([^)]+\)"/gi, `stroke="${accentColor}"`);

	// Handle style attributes with fill
	result = result.replace(
		/style="([^"]*fill:\s*#)([0-9A-Fa-f]{6})([^"]*)"/g,
		(_, before, hexColor, after) => {
			return `style="${before.replace('#', '')}${getAccentForColor(hexColor).replace('#', '')}${after}"`;
		},
	);

	return result;
}

/**
 * Process SVG files from source to destination with color conversion
 */
function processIconsFromSource(
	sourceDir: string,
	destDir: string,
	accentColor: string,
): void {
	if (!fs.existsSync(sourceDir)) {
		console.log(`Adapt Icons: Source directory not found: ${sourceDir}`);
		return;
	}

	// Ensure destination exists
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	const files = fs.readdirSync(sourceDir);

	for (const file of files) {
		const sourcePath = path.join(sourceDir, file);
		const destPath = path.join(destDir, file);
		const stat = fs.statSync(sourcePath);

		if (stat.isDirectory()) {
			processIconsFromSource(sourcePath, destPath, accentColor);
		} else if (file.endsWith('.svg')) {
			const svgContent = fs.readFileSync(sourcePath, 'utf-8');
			const monochromeContent = convertSvgToMonochrome(svgContent, accentColor);
			writeFileSync(destPath, monochromeContent);
		}
	}
}

/**
 * Find an icon definition by name (case-insensitive)
 */
function findIconDef(
	iconDefinitions: Record<string, { iconPath: string }>,
	baseName: string,
	prefix: string = '_file_',
): string | null {
	const exactKey = `${prefix}${baseName}`;
	if (iconDefinitions[exactKey]) {
		return exactKey;
	}

	const lowerBaseName = baseName.toLowerCase();
	for (const key of Object.keys(iconDefinitions)) {
		if (
			key.startsWith(prefix) &&
			key.toLowerCase() === `${prefix}${lowerBaseName}`
		) {
			return key;
		}
	}

	return null;
}

/**
 * Generate the icon theme JSON configuration
 */
export function generateIconThemeJson(iconsDir: string): IconThemeConfig {
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
		const fileIcons = fs.readdirSync(filesDir).filter((f) => f.endsWith('.svg'));
		for (const icon of fileIcons) {
			const iconName = path.basename(icon, '.svg');
			const defName = `_file_${iconName}`;
			iconDefinitions[defName] = { iconPath: `../icons/files/${icon}` };
		}
	}

	// Process folder icons
	if (fs.existsSync(foldersDir)) {
		const folderIcons = fs.readdirSync(foldersDir).filter((f) => f.endsWith('.svg'));
		for (const icon of folderIcons) {
			const iconName = path.basename(icon, '.svg');
			const defName = `_folder_${iconName}`;
			iconDefinitions[defName] = { iconPath: `../icons/folders/${icon}` };
		}
	}

	// Process folder open icons
	if (fs.existsSync(foldersOpenDir)) {
		const folderOpenIcons = fs.readdirSync(foldersOpenDir).filter((f) => f.endsWith('.svg'));
		for (const icon of folderOpenIcons) {
			const iconName = path.basename(icon, '.svg');
			const defName = `_folder_${iconName}_open`;
			iconDefinitions[defName] = { iconPath: `../icons/foldersOpen/${icon}` };
		}
	}

	// Add common mappings FIRST - these are the reliable, well-tested mappings
	// for common file types. This ensures common extensions like .js, .ts, .py
	// always map to the correct icons regardless of what patterns exist in
	// the associations JSON.
	addCommonFileExtensions(fileExtensions, iconDefinitions);
	addCommonFolderNames(folderNames, folderNamesExpanded, iconDefinitions);
	addCommonLanguageIds(languageIds, iconDefinitions);

	// Process bundled associations for additional/specialized mappings
	// These can only ADD new mappings, not override the common ones
	processIconAssociations(iconAssociations, iconDefinitions, fileExtensions, fileNames, languageIds);
	processFolderAssociations(folderAssociations, iconDefinitions, folderNames, folderNamesExpanded);

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
 * Process icon associations from bundled JSON
 * 
 * Associations are sorted by priority (ascending) so that lower priority (more generic)
 * patterns are processed first, allowing higher priority (more specific) patterns
 * to override them. Test file patterns have higher priority and should NOT set
 * the default extension mapping.
 */
function processIconAssociations(
	associations: any,
	iconDefinitions: Record<string, { iconPath: string }>,
	fileExtensions: Record<string, string>,
	fileNames: Record<string, string>,
	languageIds: Record<string, string>,
): void {
	const regexAssocs = associations?.associations?.associations?.regex || [];

	// Sort by priority ascending (lower priority = more generic = processed first)
	const sortedAssocs = [...regexAssocs].sort((a, b) => {
		const priorityA = parseInt(a.value?.priority || '0', 10);
		const priorityB = parseInt(b.value?.priority || '0', 10);
		return priorityA - priorityB;
	});

	for (const assoc of sortedAssocs) {
		const value = assoc.value;
		if (!value?.icon) continue;

		const iconFileName = path.basename(value.icon, '.svg');
		const defName = `_file_${iconFileName}`;

		if (!iconDefinitions[defName]) continue;

		// Process explicit file name mappings
		if (value.fileNames) {
			const names = value.fileNames.split(',');
			for (const name of names) {
				const trimmed = name.trim().toLowerCase();
				// Skip glob patterns like *.ts - those shouldn't be in fileNames
				if (trimmed && !trimmed.startsWith('*')) {
					fileNames[trimmed] = defName;
				}
			}
		}

		// Only extract extension mappings from simple extension patterns
		// Skip test/spec patterns which have complex patterns like: .*\\.?(test|spec)\\.ts$
		if (value.pattern) {
			// Only match simple extension patterns like: .*\\.ts$ or .*\\.(ts|tsx)$
			// Skip patterns that contain test/spec indicators
			const isTestPattern = /\(test\|spec\)|test|spec|Test|Spec/.test(value.pattern);
			if (!isTestPattern) {
				// Match simple extension at end: .*\.ext$ or .*\.(ext1|ext2)$
				const simpleExtMatch = value.pattern.match(/\\\.\(?([\w|]+)\)?\$$/);
				if (simpleExtMatch) {
					// Handle both single extensions and groups like (ts|tsx)
					const extensions = simpleExtMatch[1].split('|');
					for (const ext of extensions) {
						const cleanExt = ext.toLowerCase().trim();
						if (cleanExt && !fileExtensions[cleanExt]) {
							fileExtensions[cleanExt] = defName;
						}
					}
				}
			}
		}
	}
}

/**
 * Process folder associations from bundled JSON
 * 
 * Associations are sorted by priority (ascending) so lower priority patterns
 * are processed first, allowing higher priority patterns to override.
 */
function processFolderAssociations(
	associations: any,
	iconDefinitions: Record<string, { iconPath: string }>,
	folderNames: Record<string, string>,
	folderNamesExpanded: Record<string, string>,
): void {
	const regexAssocs = associations?.associations?.associations?.regex || [];

	// Sort by priority ascending (lower priority = processed first)
	const sortedAssocs = [...regexAssocs].sort((a, b) => {
		const priorityA = parseInt(a.value?.priority || '0', 10);
		const priorityB = parseInt(b.value?.priority || '0', 10);
		return priorityA - priorityB;
	});

	for (const assoc of sortedAssocs) {
		const value = assoc.value;
		if (!value?.icon) continue;

		const iconFileName = path.basename(value.icon, '.svg');
		const defName = `_folder_${iconFileName}`;
		const defNameOpen = `_folder_${iconFileName}_open`;

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
	iconDefinitions: Record<string, { iconPath: string }>,
): void {
	const extensionMappings: Record<string, string[]> = {
		js: ['javascript', 'javaScript', 'js'],
		mjs: ['javascript', 'javaScript', 'js'],
		cjs: ['javascript', 'javaScript', 'js'],
		jsx: ['react', 'jsx', 'reactJs'],
		ts: ['typescript', 'typeScript', 'ts'],
		tsx: ['react_ts', 'reactTs', 'tsx', 'react'],
		mts: ['typescript', 'typeScript', 'ts'],
		cts: ['typescript', 'typeScript', 'ts'],
		html: ['html', 'html5'],
		htm: ['html', 'html5'],
		css: ['css', 'css3'],
		scss: ['sass', 'scss'],
		sass: ['sass', 'scss'],
		less: ['less'],
		vue: ['vue'],
		svelte: ['svelte'],
		json: ['json'],
		yaml: ['yaml', 'yml'],
		yml: ['yaml', 'yml'],
		xml: ['xml'],
		md: ['markdown', 'md'],
		py: ['python', 'py'],
		rb: ['ruby', 'rb'],
		go: ['go', 'golang'],
		rs: ['rust', 'rs'],
		java: ['java'],
		kt: ['kotlin', 'kt'],
		c: ['c'],
		cpp: ['cpp', 'cplusplus'],
		cs: ['csharp', 'cs'],
		php: ['php'],
		swift: ['swift'],
		dart: ['dart'],
		sh: ['shell', 'bash', 'sh'],
		sql: ['database', 'sql', 'db'],
		png: ['image', 'png'],
		jpg: ['image', 'jpg', 'jpeg'],
		svg: ['svg'],
		pdf: ['pdf'],
		zip: ['zip', 'archive'],
		gitignore: ['git', 'gitignore'],
	};

	for (const [ext, possibleNames] of Object.entries(extensionMappings)) {
		if (fileExtensions[ext]) continue;

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
	iconDefinitions: Record<string, { iconPath: string }>,
): void {
	const folderMappings: Record<string, string[]> = {
		src: ['src', 'source'],
		lib: ['lib', 'library'],
		dist: ['dist', 'build', 'output'],
		build: ['build', 'dist'],
		test: ['test', 'tests'],
		tests: ['test', 'tests'],
		node_modules: ['node', 'nodeModules'],
		components: ['components', 'component'],
		config: ['config', 'configuration'],
		public: ['public'],
		assets: ['assets', 'asset'],
		images: ['images', 'image', 'img'],
		styles: ['styles', 'style', 'css'],
		docs: ['docs', 'documentation', 'doc'],
		api: ['api'],
		'.git': ['git'],
		'.github': ['github'],
		'.vscode': ['vscode'],
		docker: ['docker'],
		scripts: ['scripts', 'script'],
	};

	for (const [name, possibleNames] of Object.entries(folderMappings)) {
		if (folderNames[name]) continue;

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
	iconDefinitions: Record<string, { iconPath: string }>,
): void {
	const languageMappings: Record<string, string[]> = {
		javascript: ['javascript', 'javaScript', 'js'],
		typescript: ['typescript', 'typeScript', 'ts'],
		javascriptreact: ['react', 'jsx'],
		typescriptreact: ['react_ts', 'reactTs', 'tsx', 'react'],
		html: ['html', 'html5'],
		css: ['css', 'css3'],
		json: ['json'],
		markdown: ['markdown', 'md'],
		python: ['python', 'py'],
		go: ['go', 'golang'],
		rust: ['rust', 'rs'],
		java: ['java'],
		shellscript: ['shell', 'bash', 'sh'],
		sql: ['database', 'sql'],
	};

	for (const [langId, possibleNames] of Object.entries(languageMappings)) {
		if (languageIds[langId]) continue;

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
 * Write the icon theme JSON file with a cache-busting nonce.
 * 
 * VS Code may cache the theme JSON content. By including a unique
 * `_generatedAt` timestamp in the JSON, the file content is guaranteed
 * to differ on each regeneration, helping VS Code detect the change.
 */
function writeIconThemeFile(extensionPath: string, themeConfig: IconThemeConfig): void {
	const themePath = path.join(extensionPath, 'themes', 'adapt-icons.json');

	const themesDir = path.dirname(themePath);
	if (!fs.existsSync(themesDir)) {
		fs.mkdirSync(themesDir, { recursive: true });
	}

	// Add a cache-busting nonce so VS Code sees the JSON as changed
	const configWithNonce = {
		...themeConfig,
		_generatedAt: Date.now(),
	};

	writeFileSync(themePath, JSON.stringify(configWithNonce, null, 2));
}

/**
 * Generate the complete adapt icon theme
 * Returns a Promise for async progress tracking
 */
export async function generateAdaptIconTheme(
	extensionPath: string,
	accentColor: string,
): Promise<void> {
	const srcDir = path.join(extensionPath, 'icons-src');
	const destDir = path.join(extensionPath, 'icons');

	// Check if source directory exists
	if (!fs.existsSync(srcDir)) {
		// Fallback: process icons in place if no source directory
		console.log('Adapt Icons: No icons-src directory, processing icons in place');
		const subDirs = ['files', 'folders', 'foldersOpen'];
		for (const subDir of subDirs) {
			const dir = path.join(destDir, subDir);
			if (fs.existsSync(dir)) {
				processIconsInPlace(dir, accentColor);
			}
		}
	} else {
		// Process from source to destination
		const subDirs = ['files', 'folders', 'foldersOpen'];
		for (const subDir of subDirs) {
			const src = path.join(srcDir, subDir);
			const dest = path.join(destDir, subDir);
			if (fs.existsSync(src)) {
				processIconsFromSource(src, dest, accentColor);
			}
		}
	}

	// Generate the theme JSON
	const themeConfig = generateIconThemeJson(destDir);
	writeIconThemeFile(extensionPath, themeConfig);

	// Save to cache
	saveGeneratedAccent(extensionPath, accentColor);

	console.log(`Adapt Icons: Generated icons with accent ${accentColor}`);
}

/**
 * Process icons in place (fallback when no source directory)
 */
function processIconsInPlace(dir: string, accentColor: string): void {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			processIconsInPlace(filePath, accentColor);
		} else if (file.endsWith('.svg')) {
			const svgContent = fs.readFileSync(filePath, 'utf-8');
			const monochromeContent = convertSvgToMonochrome(svgContent, accentColor);
			writeFileSync(filePath, monochromeContent);
		}
	}
}
