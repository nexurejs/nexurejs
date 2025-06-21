/**
 * NexureJS Example - Using Native Modules
 *
 * This example demonstrates how to use NexureJS with native modules enabled,
 * including how to verify which modules are being used.
 */

import { Nexure } from '../src/core/nexure';
import { initializeFramework, SetupOptions } from '../src/setup';
import {
  Controller,
  Get,
  Post
} from '../src/decorators/route-decorators';
import { Injectable } from '../src/decorators/injection-decorators';
import { BindingType, hasNativeBinding } from '../src/utils/native-bindings';

// Initialize the framework with native modules enabled
const initOptions: SetupOptions = {
  enableNativeModules: true,
  verbose: true,
  initializeImmediately: true
};

const initResult = initializeFramework(initOptions);
console.log('Framework initialization result:', initResult);

// Create a service that uses native modules for JSON processing
@Injectable()
class UserService {
  private users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' }
  ];

  getUserById(id: number) {
    return this.users.find(user => user.id === id);
  }

  getAllUsers() {
    return this.users;
  }

  addUser(user: { name: string }) {
    const newUser = {
      id: this.users.length + 1,
      name: user.name
    };
    this.users.push(newUser);
    return newUser;
  }
}

// Create a controller
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  getAllUsers() {
    return {
      users: this.userService.getAllUsers(),
      usesNativeJson: hasNativeBinding(BindingType.JSON_PARSER)
    };
  }

  @Get('/:id')
  getUserById(req: any) {
    const id = parseInt(req.params.id);
    const user = this.userService.getUserById(id);

    if (!user) {
      return { error: 'User not found', statusCode: 404 };
    }

    return {
      user,
      usesNativeJson: hasNativeBinding(BindingType.JSON_PARSER)
    };
  }

  @Post('/')
  createUser(req: any) {
    const user = this.userService.addUser(req.body);
    return {
      user,
      usesNativeJson: hasNativeBinding(BindingType.JSON_PARSER)
    };
  }
}

// Create a controller to display information about native modules
@Controller('/native')
class NativeModuleInfoController {
  @Get('/')
  getStatus() {
    // Return information about which native modules are loaded
    return {
      jsonParser: hasNativeBinding(BindingType.JSON_PARSER),
      httpParser: hasNativeBinding(BindingType.HTTP_PARSER),
      router: hasNativeBinding(BindingType.ROUTER),
      urlParser: hasNativeBinding(BindingType.URL_PARSER),
      schema: hasNativeBinding(BindingType.SCHEMA),
      compression: hasNativeBinding(BindingType.COMPRESSION),
      websocket: hasNativeBinding(BindingType.WEBSOCKET),
      crypto: hasNativeBinding(BindingType.CRYPTO)
    };
  }
}

// Create the application
const app = new Nexure({
  logging: true,
  prettyJson: true,
  performance: {
    nativeModules: true, // Ensure native modules are enabled
    nativeModuleConfig: {
      verbose: true
    }
  }
});

// Register controllers and services
app.register(UserService);
app.register(UserController);
app.register(NativeModuleInfoController);

// Start the server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Available routes:');
  console.log('- GET /users');
  console.log('- GET /users/:id');
  console.log('- POST /users');
  console.log('- GET /native');
});

// You can test with:
// curl http://localhost:3000/users
// curl http://localhost:3000/users/1
// curl -X POST -H "Content-Type: application/json" -d '{"name":"Dave"}' http://localhost:3000/users
// curl http://localhost:3000/native
