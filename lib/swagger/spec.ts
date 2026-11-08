/**
 * OpenAPI 3.0 specification for the よみサポ Admin API
 */
export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'よみサポ Admin API',
    version: '1.0.0',
    description: `
API for managing text entries and bookmarks in the よみサポ application.

## Authentication

All admin endpoints require an API key. Include the \`x-api-key\` header in your requests:

\`\`\`
x-api-key: your-admin-api-key
\`\`\`

Set \`ADMIN_API_KEY\` in your \`.env.local\` file.

## Workflow

1. **Upload Text Entry**: POST \`/api/admin?action=text-entries\` with fileName and content
2. **Set Bookmark** (optional): POST \`/api/admin?action=bookmarks\` with fileName and bookmarkText
3. **Bulk Upload**: POST \`/api/admin?action=bulk-seed\` with array of entries

The \`/api/admin\` endpoint uses action-based routing with query parameters. Bookmarks are automatically initialized with empty strings when text entries are created.
    `,
    contact: {
      name: 'よみサポ',
      url: 'https://github.com/AQ-AzimSofi/yomi-sapo',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API server',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Admin API key from ADMIN_API_KEY environment variable',
      },
    },
    schemas: {
      TextEntry: {
        type: 'object',
        required: ['fileName', 'content'],
        properties: {
          fileName: {
            type: 'string',
            description: 'Name of the file (without .txt extension)',
            example: 'my-japanese-book',
          },
          directory: {
            type: 'string',
            description: 'Directory containing the file',
            default: 'bookv2-furigana',
            example: 'bookv2-furigana',
          },
          content: {
            type: 'string',
            description: 'Text content in the expected format: <original>>rephrase1>>rephrase2>>rephrase3',
            example:
              '< 今日は良い天気です。>> Today the weather is nice. >> The weather is good today. >> It is pleasant weather today.',
          },
        },
      },
      Bookmark: {
        type: 'object',
        required: ['fileName', 'bookmarkText'],
        properties: {
          fileName: {
            type: 'string',
            description: 'Name of the file (without .txt extension)',
            example: 'my-japanese-book',
          },
          directory: {
            type: 'string',
            description: 'Directory containing the file',
            default: 'bookv2-furigana',
            example: 'bookv2-furigana',
          },
          bookmarkText: {
            type: 'string',
            description: 'The bookmark text/position marker',
            example: '< 今日は良い天気です。',
          },
        },
      },
      BulkUpload: {
        type: 'object',
        required: ['entries'],
        properties: {
          entries: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/TextEntry',
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'string',
            example: 'Validation Error',
          },
          message: {
            type: 'string',
            example: 'fileName is required and must be a string',
          },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: 'Operation completed successfully',
          },
        },
      },
    },
  },
  paths: {
    '/admin/text-entries': {
      post: {
        summary: 'Upload or update a text entry',
        description:
          'Creates or updates a text entry in the database. Automatically initializes an empty bookmark for the file.',
        tags: ['Admin - Text Entries'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/TextEntry',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Text entry created/updated successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        stats: {
                          type: 'object',
                          properties: {
                            fileName: { type: 'string' },
                            directory: { type: 'string' },
                            contentLength: { type: 'number' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized - invalid or missing API key',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/admin/bookmarks': {
      post: {
        summary: 'Create or update a bookmark',
        description: 'Creates or updates a bookmark for a specific file',
        tags: ['Admin - Bookmarks'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Bookmark',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Bookmark created/updated successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        bookmark: {
                          type: 'object',
                          properties: {
                            fileName: { type: 'string' },
                            directory: { type: 'string' },
                            bookmarkText: { type: 'string' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/admin/bulk-seed': {
      post: {
        summary: 'Bulk upload multiple text entries',
        description: 'Upload multiple text entries at once. Each entry is processed independently.',
        tags: ['Admin - Bulk Operations'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/BulkUpload',
              },
              example: {
                entries: [
                  {
                    fileName: 'book-1',
                    directory: 'bookv2-furigana',
                    content:
                      '< 今日は良い天気です。>> Today the weather is nice. >> The weather is good today. >> It is pleasant weather today.',
                  },
                  {
                    fileName: 'book-2',
                    directory: 'bookv2-furigana',
                    content:
                      '< 彼は学生です。>> He is a student. >> He is studying. >> He attends school.',
                  },
                ],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Bulk upload completed (may include partial failures)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    stats: {
                      type: 'object',
                      properties: {
                        total: { type: 'number' },
                        succeeded: { type: 'number' },
                        failed: { type: 'number' },
                      },
                    },
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          fileName: { type: 'string' },
                          directory: { type: 'string' },
                          success: { type: 'boolean' },
                          error: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: 'Admin - Text Entries',
      description: 'Manage text entries in the database',
    },
    {
      name: 'Admin - Bookmarks',
      description: 'Manage bookmarks for text files',
    },
    {
      name: 'Admin - Bulk Operations',
      description: 'Bulk operations for multiple entries',
    },
  ],
};
