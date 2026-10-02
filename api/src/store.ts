import {
  CosmosClient,
  type Container,
  type OperationInput,
  type SqlQuerySpec,
} from '@azure/cosmos';
import { tableDocumentId, type PokerDocument } from './domain.js';

export type BatchOperation =
  | {
      operationType: 'Create';
      resourceBody: object;
      ifMatch?: string;
    }
  | {
      operationType: 'Replace';
      id: string;
      resourceBody: object;
      ifMatch?: string;
    }
  | {
      operationType: 'Delete';
      id: string;
      ifMatch?: string;
    };

let container: Container | undefined;

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getContainer(): Container {
  if (container) return container;
  const client = new CosmosClient({
    endpoint: requiredSetting('COSMOS_ENDPOINT'),
    key: requiredSetting('COSMOS_KEY'),
  });
  container = client
    .database(process.env.COSMOS_DATABASE || 'pokerbankroll')
    .container(process.env.COSMOS_CONTAINER || 'data');
  return container;
}

export async function queryDocuments<T extends PokerDocument>(
  query: SqlQuerySpec,
  partitionKey?: string,
): Promise<T[]> {
  const options = partitionKey ? { partitionKey } : {};
  const { resources } = await getContainer()
    .items.query<T>(query, options)
    .fetchAll();
  return resources;
}

export async function readDocument<T extends PokerDocument>(
  id: string,
  tableId: string,
): Promise<T> {
  const { resource } = await getContainer().item(id, tableId).read<T>();
  if (!resource) throw new Error('Record not found.');
  return resource;
}

export async function deletePartition(tableId: string): Promise<void> {
  const target = getContainer();
  const tombstoneId = tableDocumentId(tableId);
  const { resources } = await target.items
    .query<{ id: string }>(
      {
        query:
          'SELECT c.id FROM c WHERE c.tableId = @tableId AND c.id != @tombstoneId',
        parameters: [
          { name: '@tableId', value: tableId },
          { name: '@tombstoneId', value: tombstoneId },
        ],
      },
      { partitionKey: tableId },
    )
    .fetchAll();

  for (let offset = 0; offset < resources.length; offset += 100) {
    const chunk = resources.slice(offset, offset + 100);
    const response = await target.items.batch(
      chunk.map(({ id }) => ({ operationType: 'Delete', id })),
      tableId,
    );
    const status = response.code ?? 500;
    if (status < 200 || status >= 300) {
      throw new Error(`Table cleanup failed (${status}).`);
    }
  }

  const finalResponse = await target.items.batch(
    [{ operationType: 'Delete', id: tombstoneId }],
    tableId,
  );
  const finalStatus = finalResponse.code ?? 500;
  if (finalStatus < 200 || finalStatus >= 300) {
    throw new Error(`Table cleanup failed (${finalStatus}).`);
  }
}

export async function runBatch(
  tableId: string,
  operations: BatchOperation[],
): Promise<void> {
  if (operations.length === 0) return;
  if (operations.length > 100) {
    throw new Error('This operation exceeds the transactional batch limit.');
  }
  const response = await getContainer().items.batch(
    operations as OperationInput[],
    tableId,
  );
  const status = response.code ?? 500;
  if (status < 200 || status >= 300) {
    const failed = (response.result ?? []).find(
      (result) => result.statusCode >= 400,
    );
    const failureStatus = failed?.statusCode ?? status;
    if (failureStatus === 412) {
      throw new Error('The session changed. Refresh and try again.');
    }
    throw new Error(`Database transaction failed (${failureStatus}).`);
  }
}

export function resetContainerForTests(): void {
  container = undefined;
}
