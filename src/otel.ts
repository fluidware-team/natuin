import './appenv';

import { NodeSDK, NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { envDetector, hostDetector, osDetector, processDetector } from '@opentelemetry/resources';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { PROMETHEUS_EXPORTER_PORT, USE_OTEL_METRIC_EXPORTER } from './Consts';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { IncomingMessage } from 'http';

const otelSDKConfig: Partial<NodeSDKConfiguration> = {
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request: IncomingMessage): boolean => {
        return request.url === '/healthz';
      }
    }),
    new ExpressInstrumentation(),
    new MySQL2Instrumentation(),
    new PinoInstrumentation(),
    new GrpcInstrumentation()
  ],
  resourceDetectors: [envDetector, hostDetector, osDetector, processDetector]
};

if (USE_OTEL_METRIC_EXPORTER) {
  otelSDKConfig.metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter()
  });
} else {
  otelSDKConfig.metricReader = new PrometheusExporter({
    port: PROMETHEUS_EXPORTER_PORT
  });
}

const sdk = new NodeSDK(otelSDKConfig);

sdk.start();

async function stop(signal: string) {
  try {
    await sdk.shutdown();
  } catch (e: unknown | Error) {
    //
  }
  process.kill(process.pid, signal);
}

process.once('SIGTERM', async () => {
  await stop('SIGTERM');
});

process.once('SIGINT', async () => {
  await stop('SIGINT');
});

require('./main');
