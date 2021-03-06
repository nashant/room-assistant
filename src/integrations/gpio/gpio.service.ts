import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { EntitiesService } from '../../entities/entities.service';
import { ConfigService } from '../../config/config.service';
import { Gpio } from 'onoff';
import { BinarySensor } from '../../entities/binary-sensor';
import { GpioConfig } from './gpio.config';
import { makeId } from '../../util/id';
import { EntityCustomization } from '../../entities/entity-customization.interface';
import {
  BinarySensorConfig,
  BinarySensorDeviceClass,
} from '../home-assistant/binary-sensor-config';
import { SwitchConfig } from '../home-assistant/switch-config';
import { GpioSwitch } from './gpio.switch';
import { Switch } from '../../entities/switch';

@Injectable()
export class GpioService
  implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly config: GpioConfig;
  private readonly logger: Logger;
  private readonly gpios: Gpio[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly entitiesService: EntitiesService
  ) {
    this.config = this.configService.get('gpio');
    this.logger = new Logger(GpioService.name);
  }

  /**
   * Lifecycle hook, called once the application has started.
   */
  onApplicationBootstrap(): void {
    this.config.binarySensors.forEach((binarySensor) => {
      this.createBinarySensor(
        binarySensor.name,
        binarySensor.pin,
        binarySensor.deviceClass
      );
    });

    this.config.switches.forEach((switchOptions) => {
      this.createSwitch(
        switchOptions.name,
        switchOptions.pin,
        switchOptions.icon
      );
    });
  }

  /**
   * Lifecycle hook, called once the application is shutting down.
   */
  onApplicationShutdown(): void {
    this.logger.log('Closing opened GPIO pins');
    this.gpios.forEach((gpio) => {
      gpio.unexport();
    });
  }

  /**
   * Creates and register a new GPIO sensor, which updates its state based on the GPIO pin input.
   *
   * @param name - Name of the sensor
   * @param pin - GPIO pin to watch for interrupts
   * @param deviceClass - Device class of the sensor
   * @returns Registered sensor
   */
  protected createBinarySensor(
    name: string,
    pin: number,
    deviceClass?: BinarySensorDeviceClass
  ): BinarySensor {
    const id = makeId(`gpio ${name}`);
    const customizations: Array<EntityCustomization<any>> = [
      {
        for: BinarySensorConfig,
        overrides: {
          deviceClass: deviceClass,
        },
      },
    ];
    const binarySensor = this.entitiesService.add(
      new BinarySensor(id, name),
      customizations
    ) as BinarySensor;

    this.logger.log(`Opening pin ${pin} as input`);
    const gpio = new Gpio(pin, 'in', 'both');
    this.gpios.push(gpio);
    gpio.watch((err, value) => {
      if (err) {
        this.logger.error(err.message, err.stack);
        return;
      }

      binarySensor.state = Boolean(value);
    });

    return binarySensor;
  }

  /**
   * Creates a new switch that controls a GPIO output.
   *
   * @param name - Friendly name of the switch
   * @param pin - GPIO pin to output to
   * @param icon - Icon to use
   * @returns Registered switch
   */
  protected createSwitch(name: string, pin: number, icon?: string): Switch {
    const id = makeId(`gpio ${name}`);
    const customizations: Array<EntityCustomization<any>> = [
      {
        for: SwitchConfig,
        overrides: {
          icon,
        },
      },
    ];

    const gpio = new Gpio(pin, 'out');
    this.gpios.push(gpio);

    return this.entitiesService.add(
      new GpioSwitch(id, name, gpio),
      customizations
    ) as Switch;
  }
}
