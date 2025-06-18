/**
 * Test for ValidationEngine component
 */

// Load the module
try {
  console.log('Loading nexurejs_native module...');
  const nativeModule = require('./build/Release/nexurejs_native.node');
  console.log('Module loaded successfully!');

  // Check if ValidationEngine is available
  if (!nativeModule.ValidationEngine) {
    console.error('ValidationEngine component not found in the module');
    process.exit(1);
  }

  console.log('\nTesting ValidationEngine...');
  console.log('Available exports:', Object.keys(nativeModule));

  // Create ValidationEngine instance
  console.log('Creating ValidationEngine instance...');
  const validationEngine = new nativeModule.ValidationEngine();
  console.log('✓ Successfully created ValidationEngine instance');

  // Log available methods
  const methods = Object.getOwnPropertyNames(validationEngine.__proto__);
  console.log('Available methods:', methods);

  // Test schema registration and validation
  console.log('\nTesting schema registration and validation...');

  // Test registerSchema and validate methods
  if (methods.includes('registerSchema') && methods.includes('validate')) {
    // Define a simple schema for testing
    const schemaId = 'user-schema';
    const userSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
        email: { type: 'string' }
      },
      required: ['name', 'age']
    };

    // Register the schema
    console.log(`Registering schema with ID: ${schemaId}`);
    try {
      validationEngine.registerSchema(schemaId, userSchema);
      console.log('✓ Schema registered successfully');
    } catch (error) {
      console.error('Failed to register schema:', error);
    }

    // Test getSchema if available
    if (methods.includes('getSchema')) {
      console.log('\nTesting getSchema...');
      try {
        const retrievedSchema = validationEngine.getSchema(schemaId);
        console.log('Retrieved schema:', retrievedSchema ? 'Success' : 'Not found');
      } catch (error) {
        console.error('Failed to retrieve schema:', error);
      }
    }

    // Test validation with valid and invalid data
    console.log('\nTesting validation...');

    const validData = [
      { name: 'John Doe', age: 30, email: 'john@example.com' },
      { name: 'Jane Smith', age: 25 }
    ];

    const invalidData = [
      { name: 'Missing Age' },
      { name: 'Invalid Age', age: -5 },
      'not an object'
    ];

    console.log('Valid data:');
    validData.forEach((data, index) => {
      try {
        const result = validationEngine.validate(schemaId, data);
        console.log(`  Data ${index + 1}: ${JSON.stringify(result)}`);
      } catch (error) {
        console.error(`  Data ${index + 1} validation error:`, error.message);
      }
    });

    console.log('Invalid data:');
    invalidData.forEach((data, index) => {
      try {
        const result = validationEngine.validate(schemaId, data);
        console.log(`  Data ${index + 1}: ${JSON.stringify(result)}`);
      } catch (error) {
        console.error(`  Data ${index + 1} validation error:`, error.message);
      }
    });

    // Test removeSchema if available
    if (methods.includes('removeSchema')) {
      console.log('\nTesting removeSchema...');
      try {
        validationEngine.removeSchema(schemaId);
        console.log('✓ Schema removed successfully');

        // Try to validate after schema removal
        try {
          const result = validationEngine.validate(schemaId, validData[0]);
          console.log('Validation after schema removal:', result);
        } catch (error) {
          console.log('✓ Expected error after schema removal:', error.message);
        }
      } catch (error) {
        console.error('Failed to remove schema:', error);
      }
    }
  } else {
    console.log('Schema registration and validation methods not available');
  }

  // Test metrics if available
  if (methods.includes('resetMetrics') && methods.includes('getMetrics')) {
    console.log('\nTesting metrics...');

    // Reset metrics
    try {
      validationEngine.resetMetrics();
      console.log('✓ Metrics reset successfully');
    } catch (error) {
      console.error('Failed to reset metrics:', error);
    }

    // Register a schema and perform validations to generate metrics
    const testSchemaId = 'test-schema';
    const testSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        value: { type: 'number' }
      },
      required: ['id']
    };

    try {
      validationEngine.registerSchema(testSchemaId, testSchema);

      // Perform some validations
      validationEngine.validate(testSchemaId, { id: '123', value: 42 });
      validationEngine.validate(testSchemaId, { id: '456' });

      try {
        validationEngine.validate(testSchemaId, { value: 42 }); // Should fail
      } catch (e) {
        // Expected error
      }

      // Get metrics
      const metrics = validationEngine.getMetrics();
      console.log('Validation metrics:', metrics);
    } catch (error) {
      console.error('Error during metrics test:', error);
    }
  } else {
    console.log('Metrics methods not available');
  }

  console.log('\nValidationEngine test completed');

} catch (err) {
  console.error('Test failed with error:', err);
  process.exit(1);
}
