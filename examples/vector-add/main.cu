#include <cuda_runtime.h>
#include <stdio.h>
#include <stdlib.h>

// This program supports both a compile-time N and a runtime size argument.
#define N 16

__global__ void fill_values(float *output, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) output[i] = i + 3.0f;
}

static void check(cudaError_t code) {
  if (code != cudaSuccess) {
    fprintf(stderr, "ERROR: CUDA call failed: %d\n", (int)code);
    exit(1);
  }
}

int main(int argc, char **argv) {
  int n = argc > 1 ? atoi(argv[1]) : N;
  if (n < 1) return 1;
  float *device = NULL;
  float *host = (float *)malloc(n * sizeof(float));
  check(cudaMalloc((void **)&device, n * sizeof(float)));
  fill_values<<<(n + 127) / 128, 128>>>(device, n);
  check(cudaDeviceSynchronize());
  check(cudaMemcpy(host, device, n * sizeof(float), cudaMemcpyDeviceToHost));
  int mismatches = 0;
  for (int i = 0; i < n; i++) if (host[i] != i + 3.0f) mismatches++;
  printf("Non-Matching CPU-GPU Outputs: %d\n", mismatches);
  check(cudaFree(device));
  free(host);
  return mismatches ? 1 : 0;
}
