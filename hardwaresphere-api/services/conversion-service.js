const fs = require('fs').promises;
const path = require('path');
const { NodeIO, Document } = require('@gltf-transform/core');
const { KHRDracoMeshCompression } = require('@gltf-transform/extensions');
const { draco } = require('@gltf-transform/functions');
const draco3d = require('draco3dgltf');

class ConversionService {

  async convertStlToGltf(stlFilePath, outputPath, options = {}) {
    try {
      const glbPath = outputPath.replace(/\.(gltf|glb)$/i, '.glb');
      console.log(`Converting STL to Draco-compressed GLB: ${stlFilePath} → ${glbPath}`);
      const startTime = Date.now();

      const io = new NodeIO()
        .registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({
          'draco3d.encoder': await draco3d.createEncoderModule(),
        });

      const stlBuffer = await fs.readFile(stlFilePath);
      
      // Parse the STL, now with corrected color handling.
      const meshData = this.parseStlWithColor(stlBuffer);
      
      const document = this.createGltfDocument(meshData);

      // Apply Draco compression - but preserve COLOR_0 attribute
      await document.transform(
        draco({
          method: 'edgebreaker',
          quality: 6,
          quantizationBits: {
            POSITION: 12,
            NORMAL: 8,
            COLOR_0: 8,  // FIX: Make sure COLOR_0 is preserved during compression
          },
        })
      );

      const glbBuffer = await io.writeBinary(document);

      await fs.writeFile(glbPath, glbBuffer);

      const originalSize = stlBuffer.length;
      const convertedSize = glbBuffer.length;
      const compressionRatio = ((originalSize - convertedSize) / originalSize * 100).toFixed(1);
      const conversionTime = Date.now() - startTime;

      console.log(`✅ STL → Draco GLB conversion completed in ${conversionTime}ms`);
      console.log(`📊 Size reduction: ${this.formatFileSize(originalSize)} → ${this.formatFileSize(convertedSize)} (${compressionRatio}% smaller)`);
      
      return {
        success: true,
        originalSize,
        convertedSize,
        compressionRatio: Math.max(0, parseFloat(compressionRatio)),
        conversionTime,
        triangleCount: meshData.triangleCount,
        filePath: glbPath,
        hasColors: meshData.colors && meshData.colors.length > 0  // FIX: Include color info in result
      };

    } catch (error) {
      console.error('❌ STL → GLB conversion failed:', error);
      throw new Error(`Conversion failed: ${error.message}`);
    }
  }

  createGltfDocument(meshData) {
    const document = new Document();
    const buffer = document.createBuffer();
    const scene = document.createScene('DefaultScene');
    const node = document.createNode('MeshNode');
    const mesh = document.createMesh('Mesh');
    
    const positionAccessor = document.createAccessor('POSITION')
      .setArray(new Float32Array(meshData.vertices))
      .setType('VEC3')
      .setBuffer(buffer);
      
    const normalAccessor = document.createAccessor('NORMAL')
      .setArray(new Float32Array(meshData.normals))
      .setType('VEC3')
      .setBuffer(buffer);
      
    const indicesAccessor = document.createAccessor('INDICES')
      .setArray(new Uint32Array(meshData.indices))
      .setType('SCALAR')
      .setBuffer(buffer);

    const prim = document.createPrimitive()
      .setAttribute('POSITION', positionAccessor)
      .setAttribute('NORMAL', normalAccessor)
      .setIndices(indicesAccessor);

    // Create material first
    const material = document.createMaterial('DefaultMaterial')
      .setBaseColorFactor([1, 1, 1, 1]) // White base color
      .setMetallicFactor(0.1)
      .setRoughnessFactor(0.8)
      .setDoubleSided(true);

    // FIX: Handle color data more carefully
    if (meshData.colors && meshData.colors.length > 0) {
      console.log(`🎨 Applying vertex colors to the model (${meshData.colors.length} color values).`);
      
      // FIX: Ensure we have the right number of color values
      const expectedColorCount = meshData.vertices.length; // Same as vertex count (3 components each)
      if (meshData.colors.length !== expectedColorCount) {
        console.warn(`⚠️  Color array length mismatch: expected ${expectedColorCount}, got ${meshData.colors.length}`);
      }
      
      const colorAccessor = document.createAccessor('COLOR_0')
        .setArray(new Float32Array(meshData.colors))
        .setType('VEC3')
        .setBuffer(buffer);
      
      prim.setAttribute('COLOR_0', colorAccessor);
      
      // FIX: For vertex colors in glTF, we need to modify the material properly
      // Set base color factor to white so vertex colors show through
      material.setBaseColorFactor([1, 1, 1, 1]);
    }
      
    prim.setMaterial(material);
    mesh.addPrimitive(prim);
    node.setMesh(mesh);
    scene.addChild(node);

    return document;
  }

  /**
   * Parses a binary STL buffer, extracting geometry and color data.
   * This version is corrected to handle the common BGR color format.
   */
  parseStlWithColor(buffer) {
    const triangleCount = buffer.readUInt32LE(80);
    let offset = 84;
    console.log(`📊 Parsing STL with ${triangleCount} triangles.`);

    const vertices = [];
    const normals = [];
    const colors = [];
    const indices = new Array(triangleCount * 3).fill(0).map((_, i) => i);
    let hasColor = false;
    let colorTriangleCount = 0;  // FIX: Track how many triangles actually have color

    for (let i = 0; i < triangleCount; i++) {
      // Read normal and vertex data for one triangle.
      const n = [buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)];
      const v1 = [buffer.readFloatLE(offset + 12), buffer.readFloatLE(offset + 16), buffer.readFloatLE(offset + 20)];
      const v2 = [buffer.readFloatLE(offset + 24), buffer.readFloatLE(offset + 28), buffer.readFloatLE(offset + 32)];
      const v3 = [buffer.readFloatLE(offset + 36), buffer.readFloatLE(offset + 40), buffer.readFloatLE(offset + 44)];
      
      const attribute = buffer.readUInt16LE(offset + 48);
      
      vertices.push(...v1, ...v2, ...v3);
      normals.push(...n, ...n, ...n);

      // FIX: More robust color detection and parsing
      // Check if the 'color is valid' bit is set (bit 15)
      if ((attribute & 0x8000) !== 0) {
        hasColor = true;
        colorTriangleCount++;
        
        // FIX: Try both RGB and BGR interpretations
        // First try BGR (more common)
        const b = ((attribute >> 10) & 0x1F) / 31.0;
        const g = ((attribute >> 5) & 0x1F) / 31.0;
        const r = (attribute & 0x1F) / 31.0;
        
        // FIX: Add validation - if colors are too dark, might be RGB instead
        const avgColor = (r + g + b) / 3;
        let finalR = r, finalG = g, finalB = b;
        
        // If average color is very dark, try RGB interpretation
        if (avgColor < 0.1) {
          finalR = ((attribute >> 10) & 0x1F) / 31.0;
          finalG = ((attribute >> 5) & 0x1F) / 31.0;
          finalB = (attribute & 0x1F) / 31.0;
        }

        // Add the parsed RGB color for each of the three vertices of the triangle.
        colors.push(finalR, finalG, finalB, finalR, finalG, finalB, finalR, finalG, finalB);
      } else {
        // FIX: Check if this is a "no color" triangle or if color bit interpretation is wrong
        // Some STL files don't use the color bit but still have color data
        if (attribute !== 0) {
          // Try to extract color anyway
          const b = ((attribute >> 10) & 0x1F) / 31.0;
          const g = ((attribute >> 5) & 0x1F) / 31.0;
          const r = (attribute & 0x1F) / 31.0;
          
          // If we get a reasonable color, use it
          if (r > 0.05 || g > 0.05 || b > 0.05) {
            hasColor = true;
            colorTriangleCount++;
            colors.push(r, g, b, r, g, b, r, g, b);
          } else {
            // Default grey color
            const defaultColor = [0.7, 0.7, 0.7];
            colors.push(...defaultColor, ...defaultColor, ...defaultColor);
          }
        } else {
          // True no-color triangle
          const defaultColor = [0.7, 0.7, 0.7];
          colors.push(...defaultColor, ...defaultColor, ...defaultColor);
        }
      }
      
      offset += 50;
    }
    
    console.log(`🎨 Color analysis: ${colorTriangleCount}/${triangleCount} triangles have color data`);
    
    const { scaledVertices, boundingBox } = this.scaleAndCenterVertices(vertices);

    return {
      vertices: scaledVertices,
      normals,
      // FIX: Always include colors array if we parsed any color data
      colors: hasColor ? colors : [],
      indices,
      triangleCount,
      boundingBox,
      hasColors: hasColor  // FIX: Include this info
    };
  }

  scaleAndCenterVertices(vertices) {
    if (vertices.length === 0) return { scaledVertices: vertices, boundingBox: null };
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    
    const sizeX = maxX - minX, sizeY = maxY - minY, sizeZ = maxZ - minZ;
    const maxDimension = Math.max(sizeX, sizeY, sizeZ);
    const scale = maxDimension > 0 ? 10 / maxDimension : 1;
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    const scaledVertices = new Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
      scaledVertices[i] = (vertices[i] - centerX) * scale;
      scaledVertices[i + 1] = (vertices[i + 1] - centerY) * scale;
      scaledVertices[i + 2] = (vertices[i + 2] - centerZ) * scale;
    }
    
    const scaledMin = { x: (minX - centerX) * scale, y: (minY - centerY) * scale, z: (minZ - centerZ) * scale };
    const scaledMax = { x: (maxX - centerX) * scale, y: (maxY - centerY) * scale, z: (maxZ - centerZ) * scale };

    return {
      scaledVertices,
      boundingBox: {
        min: [scaledMin.x, scaledMin.y, scaledMin.z],
        max: [scaledMax.x, scaledMax.y, scaledMax.z]
      }
    };
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async cleanupConversionFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`🧹 Cleaned up conversion file: ${filePath}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error cleaning up ${filePath}:`, error);
        }
      }
    }
  }

  // FIX: Add a debugging method to inspect STL color data
  async debugStlColors(stlFilePath) {
    const stlBuffer = await fs.readFile(stlFilePath);
    const triangleCount = stlBuffer.readUInt32LE(80);
    let offset = 84;
    
    console.log(`🔍 Debugging STL colors for ${triangleCount} triangles:`);
    
    let colorTriangles = 0;
    let uniqueColors = new Set();
    
    for (let i = 0; i < Math.min(triangleCount, 100); i++) { // Check first 100 triangles
      const attribute = stlBuffer.readUInt16LE(offset + 48);
      
      if (attribute !== 0) {
        const hasColorBit = (attribute & 0x8000) !== 0;
        const b = ((attribute >> 10) & 0x1F) / 31.0;
        const g = ((attribute >> 5) & 0x1F) / 31.0;
        const r = (attribute & 0x1F) / 31.0;
        
        console.log(`Triangle ${i}: attr=0x${attribute.toString(16).padStart(4, '0')}, hasColorBit=${hasColorBit}, RGB=[${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}]`);
        
        if (hasColorBit || r > 0.05 || g > 0.05 || b > 0.05) {
          colorTriangles++;
          uniqueColors.add(`${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)}`);
        }
      }
      
      offset += 50;
    }
    
    console.log(`📊 Found ${colorTriangles} colored triangles with ${uniqueColors.size} unique colors`);
    return { colorTriangles, uniqueColors: Array.from(uniqueColors) };
  }
}

module.exports = new ConversionService();