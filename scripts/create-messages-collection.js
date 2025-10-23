import fetch from 'node-fetch';

const DIRECTUS_URL = process.env.DIRECTUS_URL || "https://nutrichatbot.app.11mind.com.br";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
  console.error('ERROR: DIRECTUS_TOKEN is required');
  process.exit(1);
}

async function createCollection() {
  console.log('🚀 Creating whatsapp_messages collection in Directus...\n');

  try {
    // Step 1: Create the collection
    console.log('Step 1: Creating collection...');
    const collectionResponse = await fetch(`${DIRECTUS_URL}/collections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        collection: 'whatsapp_messages',
        meta: {
          collection: 'whatsapp_messages',
          icon: 'chat',
          note: 'WhatsApp conversation messages from patients',
          display_template: null,
          hidden: false,
          singleton: false,
          translations: null,
          archive_field: null,
          archive_app_filter: true,
          archive_value: null,
          unarchive_value: null,
          sort_field: 'timestamp',
          accountability: 'all',
          color: null,
          item_duplication_fields: null,
          sort: null,
          group: null,
          collapse: 'open'
        },
        schema: {
          name: 'whatsapp_messages'
        }
      })
    });

    if (!collectionResponse.ok) {
      const errorText = await collectionResponse.text();
      console.error('❌ Failed to create collection:', errorText);
      throw new Error(`Collection creation failed: ${collectionResponse.status}`);
    }

    console.log('✅ Collection created successfully\n');

    // Step 2: Create fields
    const fields = [
      {
        field: 'id',
        type: 'integer',
        meta: {
          hidden: true,
          interface: 'input',
          readonly: true
        },
        schema: {
          name: 'id',
          table: 'whatsapp_messages',
          data_type: 'integer',
          is_primary_key: true,
          has_auto_increment: true,
          is_nullable: false
        }
      },
      {
        field: 'patient_id',
        type: 'string',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          required: true,
          options: {
            template: '{{Nome_Completo}}'
          },
          display: 'related-values',
          display_options: {
            template: '{{Nome_Completo}}'
          },
          width: 'half'
        },
        schema: {
          name: 'patient_id',
          table: 'whatsapp_messages',
          data_type: 'varchar',
          foreign_key_table: 'Cadastro_de_Pacientes',
          foreign_key_column: 'id',
          is_nullable: false
        }
      },
      {
        field: 'message_body',
        type: 'text',
        meta: {
          interface: 'input-multiline',
          required: true,
          width: 'full'
        },
        schema: {
          name: 'message_body',
          table: 'whatsapp_messages',
          data_type: 'text',
          is_nullable: false
        }
      },
      {
        field: 'from_me',
        type: 'boolean',
        meta: {
          interface: 'boolean',
          required: true,
          width: 'half',
          note: 'true = agent IA, false = patient'
        },
        schema: {
          name: 'from_me',
          table: 'whatsapp_messages',
          data_type: 'boolean',
          default_value: false,
          is_nullable: false
        }
      },
      {
        field: 'message_type',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          required: true,
          width: 'half',
          options: {
            choices: [
              { text: 'Text', value: 'text' },
              { text: 'Image', value: 'image' },
              { text: 'Audio', value: 'audio' },
              { text: 'Video', value: 'video' },
              { text: 'Document', value: 'document' }
            ]
          }
        },
        schema: {
          name: 'message_type',
          table: 'whatsapp_messages',
          data_type: 'varchar',
          max_length: 50,
          default_value: 'text',
          is_nullable: false
        }
      },
      {
        field: 'phone_number',
        type: 'string',
        meta: {
          interface: 'input',
          required: true,
          width: 'half',
          note: 'WhatsApp phone number (e.g., 5511999999999)'
        },
        schema: {
          name: 'phone_number',
          table: 'whatsapp_messages',
          data_type: 'varchar',
          max_length: 20,
          is_nullable: false
        }
      },
      {
        field: 'timestamp',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          required: true,
          width: 'half',
          note: 'Message timestamp from WhatsApp'
        },
        schema: {
          name: 'timestamp',
          table: 'whatsapp_messages',
          data_type: 'timestamp',
          is_nullable: false
        }
      },
      {
        field: 'date_created',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          readonly: true,
          hidden: true,
          special: ['date-created']
        },
        schema: {
          name: 'date_created',
          table: 'whatsapp_messages',
          data_type: 'timestamp',
          is_nullable: true
        }
      },
      {
        field: 'date_updated',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          readonly: true,
          hidden: true,
          special: ['date-updated']
        },
        schema: {
          name: 'date_updated',
          table: 'whatsapp_messages',
          data_type: 'timestamp',
          is_nullable: true
        }
      }
    ];

    console.log('Step 2: Creating fields...');
    for (const fieldConfig of fields) {
      console.log(`  - Creating field: ${fieldConfig.field}`);
      const fieldResponse = await fetch(`${DIRECTUS_URL}/fields/whatsapp_messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fieldConfig)
      });

      if (!fieldResponse.ok) {
        const errorText = await fieldResponse.text();
        console.error(`    ❌ Failed to create field ${fieldConfig.field}:`, errorText);
      } else {
        console.log(`    ✅ Field ${fieldConfig.field} created`);
      }
    }

    console.log('\n✨ Collection setup complete!\n');
    console.log('Collection: whatsapp_messages');
    console.log('Fields created:');
    console.log('  - id (auto-increment primary key)');
    console.log('  - patient_id (relation to Cadastro_de_Pacientes)');
    console.log('  - message_body (text)');
    console.log('  - from_me (boolean)');
    console.log('  - message_type (text/image/audio/video/document)');
    console.log('  - phone_number (WhatsApp number)');
    console.log('  - timestamp (message datetime)');
    console.log('  - date_created (auto)');
    console.log('  - date_updated (auto)');

  } catch (error) {
    console.error('\n❌ Error creating collection:', error.message);
    process.exit(1);
  }
}

createCollection();
