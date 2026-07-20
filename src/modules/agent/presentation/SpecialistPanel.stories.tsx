import type { Meta, StoryObj } from "@storybook/react";
import { SpecialistPanel } from "./SpecialistPanel";

const meta: Meta<typeof SpecialistPanel> = {
  title: "Agent/SpecialistPanel",
  component: SpecialistPanel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SpecialistPanel>;

export const Default: Story = {
  args: {
    onClose: () => {},
    onDelegate: (_specialistId: string, _task: string, _context: string) => {},
  },
};
