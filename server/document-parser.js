// Document Parser for Clumo Onboarding
// Extracts text from uploaded documents (PDF, PPTX, MD, PNG/JPG)

const officeParser = require('officeparser');
const fs = require('fs');
const path = require('path');

class DocumentParser {
  constructor(openai) {
    this.openai = openai; // Azure OpenAI client for vision (image parsing)
  }

  // Parse a single file and return extracted text
  async parseFile(filePath, originalName) {
    const ext = path.extname(originalName || filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
      case '.pptx':
      case '.docx':
        return await this.parseOfficeDocument(filePath, originalName, ext);
      case '.md':
      case '.txt':
        return await this.parseTextFile(filePath, originalName);
      case '.png':
      case '.jpg':
      case '.jpeg':
        return await this.parseImage(filePath, originalName);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  // Parse PDF, PPTX, DOCX using officeparser
  async parseOfficeDocument(filePath, originalName, ext) {
    // officeparser needs the file extension to detect format.
    // Multer stores files without extensions, so rename temporarily if needed.
    const currentExt = path.extname(filePath).toLowerCase();
    let parseTarget = filePath;
    let renamed = false;

    if (!currentExt && ext) {
      parseTarget = filePath + ext;
      await fs.promises.rename(filePath, parseTarget);
      renamed = true;
    }

    try {
      const text = await officeParser.parseOfficeAsync(parseTarget);
      return {
        filename: originalName,
        type: ext.replace('.', ''),
        content: text.trim()
      };
    } catch (error) {
      throw new Error(`Failed to parse ${originalName}: ${error.message}`);
    } finally {
      // Rename back so cleanup code can find the original path
      if (renamed) {
        try { await fs.promises.rename(parseTarget, filePath); } catch (e) { console.warn(`[DocumentParser] Failed to rename ${parseTarget} back to ${filePath}:`, e.message); }
      }
    }
  }

  // Parse markdown/text files
  async parseTextFile(filePath, originalName) {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return {
      filename: originalName,
      type: 'text',
      content: content.trim()
    };
  }

  // Parse images using GPT-4o vision
  async parseImage(filePath, originalName) {
    try {
      const imageBuffer = await fs.promises.readFile(filePath);
      const base64Image = imageBuffer.toString('base64');
      const ext = path.extname(originalName).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

      const response = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract ALL text, data, and key information from this image. Include any headings, bullet points, statistics, company names, product names, testimonials, and other relevant content. Format the output as clean, readable text.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000
      });

      const content = response.choices[0].message.content.trim();
      return {
        filename: originalName,
        type: 'image',
        content
      };
    } catch (error) {
      throw new Error(`Failed to parse image ${originalName}: ${error.message}`);
    }
  }

  // Parse multiple files
  async parseFiles(files) {
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await this.parseFile(file.path, file.originalname);
        results.push(result);
      } catch (error) {
        errors.push({ filename: file.originalname, error: error.message });
      }
    }

    return { results, errors };
  }
}

module.exports = DocumentParser;
