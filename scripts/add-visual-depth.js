#!/usr/bin/env node
/**
 * Add Visual Depth to SVG Icons
 * 
 * This script processes SVG files in icons-src/ and assigns different luminance colors
 * to create visual depth between folder backgrounds and their decorator icons.
 * 
 * The convertSvgToMonochrome function will map these colors based on luminance:
 * - Base color (medium luminance) -> accent color (folder background)
 * - Light color (high luminance) -> lighter accent variant (decorator icons)
 * 
 * Color assignments:
 * - Folder background: base (#5a6878) - will become the accent color
 * - Decorator icons: light (#e2e8f0) - will become accent +30% lightness
 */

const fs = require('fs');
const path = require('path');

// Base color (luminance ~0.40) - for folder backgrounds, maps to accent color
const BASE_COLOR = '#5a6878';
// Light variant (luminance ~0.88) - for decorator icons (logos, symbols)
const LIGHT_COLOR = '#e2e8f0';
// Dark variant (luminance ~0.22) - for elements that need to be darker (rarely used)
const DARK_COLOR = '#2d3748';

/**
 * Calculate luminance of a hex color (for debugging/verification)
 */
function calculateLuminance(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Parse SVG and extract path-like elements with their positions
 */
function parseSvgElements(svgContent) {
  const elementPattern = /<(path|circle|rect|polygon|ellipse|line|polyline)\s+[^>]*>/gi;
  const matches = [];
  let match;
  
  while ((match = elementPattern.exec(svgContent)) !== null) {
    matches.push({
      element: match[0],
      index: match.index,
      type: match[1]
    });
  }
  
  return matches;
}

/**
 * Check if element has a fill attribute (not none, transparent, or url)
 */
function hasFill(element) {
  const fillMatch = element.match(/fill="([^"]*)"/);
  if (!fillMatch) return false;
  const fill = fillMatch[1].toLowerCase();
  return fill !== 'none' && fill !== 'transparent' && !fill.startsWith('url(');
}

/**
 * Replace fill color in an element
 */
function replaceFill(element, newColor) {
  if (element.match(/fill="/)) {
    return element.replace(/fill="[^"]*"/, `fill="${newColor}"`);
  } else {
    // Add fill if not present
    return element.replace(/^<(\w+)\s+/, `<$1 fill="${newColor}" `);
  }
}

/**
 * Check if SVG has fill on a group element wrapping paths
 */
function hasGroupFill(svgContent) {
  const groupWithFill = svgContent.match(/<g[^>]*fill="[^"]*"[^>]*>/);
  if (!groupWithFill) return false;
  const pathCount = (svgContent.match(/<path/gi) || []).length;
  return pathCount > 1;
}

/**
 * Get color assignment for paths based on position and type
 * For folders: folder shape uses BASE (accent), decorator icons use LIGHT
 */
function getColorAssignment(pathCount, isFolder) {
  if (pathCount === 1) {
    // Single element - use base color (will become accent)
    return [BASE_COLOR];
  }
  
  if (isFolder) {
    // For folders with decorators:
    // - First path (folder shape) = BASE color (will become accent color)
    // - All subsequent paths (decorator icons) = LIGHT color (will become lighter accent)
    const colors = [BASE_COLOR];
    for (let i = 1; i < pathCount; i++) {
      colors.push(LIGHT_COLOR);
    }
    return colors;
  }
  
  // For file icons: create visual hierarchy
  if (pathCount === 2) {
    return [BASE_COLOR, LIGHT_COLOR];
  } else if (pathCount === 3) {
    return [DARK_COLOR, BASE_COLOR, LIGHT_COLOR];
  } else {
    // For many paths, alternate to create depth
    const colors = [];
    for (let i = 0; i < pathCount; i++) {
      if (i === 0) {
        colors.push(BASE_COLOR);
      } else if (i % 2 === 1) {
        colors.push(LIGHT_COLOR);
      } else {
        colors.push(BASE_COLOR);
      }
    }
    return colors;
  }
}

/**
 * Restructure SVG that has fill on a group element
 */
function restructureGroupFill(svgContent, isFolder) {
  // Find and remove fill from group
  const groupMatch = svgContent.match(/<g([^>]*)fill="([^"]*)"([^>]*)>/);
  if (!groupMatch) return svgContent;
  
  const fullGroupTag = groupMatch[0];
  const beforeFill = groupMatch[1];
  const afterFill = groupMatch[3];
  
  // Remove fill from group
  const newGroupTag = `<g${beforeFill}${afterFill}>`.replace(/\s+>/g, '>').replace(/\s{2,}/g, ' ');
  svgContent = svgContent.replace(fullGroupTag, newGroupTag);
  
  // Now add fill to individual paths
  return processIndividualPaths(svgContent, isFolder);
}

/**
 * Process individual paths and assign depth colors
 */
function processIndividualPaths(svgContent, isFolder) {
  const paths = parseSvgElements(svgContent);
  
  if (paths.length === 0) {
    return svgContent;
  }
  
  // Get color assignment
  const colors = getColorAssignment(paths.length, isFolder);
  
  let result = svgContent;
  // Process in reverse order to maintain indices
  for (let i = paths.length - 1; i >= 0; i--) {
    const pathInfo = paths[i];
    const newPath = replaceFill(pathInfo.element, colors[i]);
    result = result.slice(0, pathInfo.index) + newPath + result.slice(pathInfo.index + pathInfo.element.length);
  }
  
  return result;
}

/**
 * Process SVG content to add visual depth
 */
function addVisualDepth(svgContent, filePath) {
  const isFolder = filePath.includes('/folders/') || filePath.includes('/foldersOpen/');
  
  // Check if it's a group-based structure
  if (hasGroupFill(svgContent)) {
    svgContent = restructureGroupFill(svgContent, isFolder);
  } else {
    svgContent = processIndividualPaths(svgContent, isFolder);
  }
  
  return svgContent;
}

/**
 * Process a single SVG file
 */
function processSvgFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    content = addVisualDepth(content, filePath);
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Process all SVG files in a directory recursively
 */
function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return { processed: 0, modified: 0 };
  }
  
  let processed = 0;
  let modified = 0;
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      const result = processDirectory(fullPath);
      processed += result.processed;
      modified += result.modified;
    } else if (entry.name.endsWith('.svg')) {
      processed++;
      if (processSvgFile(fullPath)) {
        modified++;
      }
    }
  }
  
  return { processed, modified };
}

// Main execution
const iconsSrcDir = path.join(__dirname, '..', 'icons-src');

console.log('Adding visual depth to SVG icons...');
console.log(`Processing source directory: ${iconsSrcDir}`);
console.log('');
console.log('Color luminance values:');
console.log(`  Dark (folder bg):  ${DARK_COLOR} (luminance: ${calculateLuminance(DARK_COLOR).toFixed(2)})`);
console.log(`  Base (neutral):    ${BASE_COLOR} (luminance: ${calculateLuminance(BASE_COLOR).toFixed(2)})`);
console.log(`  Light (decorator): ${LIGHT_COLOR} (luminance: ${calculateLuminance(LIGHT_COLOR).toFixed(2)})`);
console.log('');

// Process only folder icons for visual depth (file icons can keep simpler treatment)
const subDirs = ['folders', 'foldersOpen'];
let totalProcessed = 0;
let totalModified = 0;

for (const subDir of subDirs) {
  const dirPath = path.join(iconsSrcDir, subDir);
  console.log(`Processing ${subDir}/...`);
  const result = processDirectory(dirPath);
  console.log(`  Processed: ${result.processed}, Modified: ${result.modified}`);
  totalProcessed += result.processed;
  totalModified += result.modified;
}

console.log('');
console.log(`Total: ${totalProcessed} files processed, ${totalModified} files modified`);
console.log('');
console.log('Next step: Run icon generation to apply accent colors with depth');
