# interactive-engines

Simulation engines and acceptance harnesses for an in-progress bitcoin
education product.

This code is public so the simulations' behavior can be independently
verified rather than taken on trust: run the harness, replay any recorded
seed, and check the assertions. Every run, including every learner-facing
run, is reproducible from its seed and configuration.

Each engine lives in its own directory under `engines/`. `harness/` holds
the shared test infrastructure: seeded PRNG, replay capture, batch runner,
and distributional reporting. Each engine's claims about its own behavior
are stated as named assertions in its test battery. If it isn't asserted,
it isn't claimed. Development documents are maintained privately.

## License

The code in this repository — the simulation engines and their test harnesses
— is MIT licensed (see [LICENSE](./LICENSE)). Run it, fork it, verify it,
reuse it.

Everything else is separate and not in this repository: the curriculum, the
six-week structure, the reward mechanism, the brand, and the hosted
experience. None of it is covered by the MIT grant above; all rights are
reserved. For licensing inquiries, contact lukelpollard@gmail.com.